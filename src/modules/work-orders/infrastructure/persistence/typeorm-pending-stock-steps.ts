import { Inject, Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Clock } from '../../../../shared/application/ports/clock.port';
import { currentEntityManager } from '../../../../shared/infrastructure/database/typeorm-transaction-runner';
import { CLOCK } from '../../../../shared/shared.tokens';
import {
  ClaimedStockStep,
  PendingStockSteps,
  StockStep,
  StockStepKind,
} from '../../application/ports/pending-stock-steps.port';
import { StockLine } from '../../application/ports/stock-ledger.port';

interface StepPayload {
  actorUserId: string;
  lines?: StockLine[];
  consumptionOperationId?: string;
}

interface ClaimedRow {
  operation_id: string;
  kind: string;
  payload: StepPayload;
  attempts: number;
  work_order_external_id: string;
}

// The claim is one statement, so the row locks live only as long as it: the rows are picked with
// SKIP LOCKED, which never waits for a step another claim holds, then pushed to the end of the lease
// with the attempt counted. Once it commits, no other claim returns them before the lease runs out.
// A lease that runs out is how a step whose claimer died comes back.
// The steps of a work order apply in the order they were recorded: a step is picked only while no
// older step of its work order is armed, pending or failed. That leaves one step per work order for
// a claim, the oldest that is not done, and a failed step holds the later ones until an operator
// sets it back to pending. The steps of other work orders are not held.
// An undo is outside that order: it touches only the unconfirmed consumption of its own operation,
// which no other step reads. It is picked once it is due, and it holds no later step.
const CLAIM_DUE = `
  WITH due AS (
    SELECT candidate.id FROM work_order_stock_steps candidate
     WHERE candidate.status IN ('ARMED', 'PENDING') AND candidate.due_at <= $1
       AND ($4::uuid[] IS NULL OR candidate.operation_id = ANY($4::uuid[]))
       AND (
         candidate.kind = 'UNDO_CONSUMPTION'
         OR NOT EXISTS (
           SELECT 1 FROM work_order_stock_steps older
            WHERE older.work_order_id = candidate.work_order_id
              AND older.id < candidate.id
              AND older.kind <> 'UNDO_CONSUMPTION'
              AND older.status IN ('ARMED', 'PENDING', 'FAILED')
         )
       )
     ORDER BY candidate.due_at, candidate.id
     LIMIT $2
       FOR UPDATE OF candidate SKIP LOCKED
  )
  UPDATE work_order_stock_steps step
     SET status = 'PENDING', attempts = step.attempts + 1, due_at = $3
    FROM due, work_orders wo
   WHERE step.id = due.id AND wo.id = step.work_order_id
  RETURNING step.operation_id, step.kind, step.payload, step.attempts,
            wo.external_id AS work_order_external_id
`;

/**
 * The outbox of `work-orders` over `work_order_stock_steps`. `enqueue`, `disarm` and `complete` join
 * the transaction of the caller, so a step is recorded or closed with the save it belongs to. Every
 * other write is a statement of its own, committed at once.
 */
@Injectable()
export class TypeOrmPendingStockSteps implements PendingStockSteps {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async arm(step: StockStep, dueAt: Date): Promise<void> {
    await this.insert(this.dataSource.manager, step, 'ARMED', dueAt);
  }

  async enqueue(step: StockStep): Promise<void> {
    await this.insert(
      currentEntityManager() ?? this.dataSource.manager,
      step,
      'PENDING',
      this.clock.now(),
    );
  }

  async disarm(operationId: string): Promise<boolean> {
    const manager = currentEntityManager() ?? this.dataSource.manager;
    // A claim turns an armed step pending, so the status condition is what tells a request whether
    // the processor took its step. TypeORM answers an UPDATE with `[rows, rowCount]`.
    const [rows]: [Array<{ id: string }>, number] = await manager.query(
      `UPDATE work_order_stock_steps
          SET status = 'DONE', completed_at = $2
        WHERE operation_id = $1 AND status = 'ARMED'
        RETURNING id`,
      [operationId, this.clock.now()],
    );
    return rows.length > 0;
  }

  async complete(operationId: string): Promise<void> {
    const manager = currentEntityManager() ?? this.dataSource.manager;
    await manager.query(
      `UPDATE work_order_stock_steps
          SET status = 'DONE', completed_at = $2
        WHERE operation_id = $1 AND status IN ('ARMED', 'PENDING')`,
      [operationId, this.clock.now()],
    );
  }

  async release(operationId: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE work_order_stock_steps
          SET status = 'PENDING', due_at = $2
        WHERE operation_id = $1 AND status = 'ARMED'`,
      [operationId, this.clock.now()],
    );
  }

  async claimDue(
    now: Date,
    limit: number,
    leaseUntil: Date,
    operationIds?: string[],
  ): Promise<ClaimedStockStep[]> {
    // TypeORM answers an UPDATE with `[rows, rowCount]`, unlike the plain rows a SELECT answers.
    const [rows]: [ClaimedRow[], number] = await this.dataSource.query(CLAIM_DUE, [
      now,
      limit,
      leaseUntil,
      operationIds ?? null,
    ]);
    return rows.map((row) => ({
      operationId: row.operation_id,
      kind: row.kind as StockStepKind,
      workOrderId: row.work_order_external_id,
      actorUserId: row.payload.actorUserId,
      lines: row.payload.lines,
      consumptionOperationId: row.payload.consumptionOperationId,
      attempts: row.attempts,
    }));
  }

  async recordFailure(operationId: string, error: string, nextDueAt: Date): Promise<void> {
    await this.dataSource.query(
      `UPDATE work_order_stock_steps
          SET last_error = $2, due_at = $3
        WHERE operation_id = $1 AND status IN ('ARMED', 'PENDING')`,
      [operationId, error, nextDueAt],
    );
  }

  async markFailed(operationId: string, error: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE work_order_stock_steps
          SET status = 'FAILED', last_error = $2
        WHERE operation_id = $1 AND status IN ('ARMED', 'PENDING')`,
      [operationId, error],
    );
  }

  private async insert(
    manager: EntityManager,
    step: StockStep,
    status: 'ARMED' | 'PENDING',
    dueAt: Date,
  ): Promise<void> {
    const payload: StepPayload = {
      actorUserId: step.actorUserId,
      lines: step.lines,
      consumptionOperationId: step.consumptionOperationId,
    };
    const rows: unknown[] = await manager.query(
      `INSERT INTO work_order_stock_steps
         (operation_id, kind, work_order_id, payload, status, due_at, created_at)
       SELECT $1::uuid, $2::varchar, wo.id, $3::jsonb, $4::varchar, $5::timestamptz, $6::timestamptz
         FROM work_orders wo
        WHERE wo.external_id = $7
       RETURNING id`,
      [
        step.operationId,
        step.kind,
        JSON.stringify(payload),
        status,
        dueAt,
        this.clock.now(),
        step.workOrderId,
      ],
    );
    if (rows.length === 0) {
      throw new Error(`work_orders row for external id ${step.workOrderId} not found`);
    }
  }
}
