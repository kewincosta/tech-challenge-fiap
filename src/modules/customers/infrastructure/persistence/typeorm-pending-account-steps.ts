import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Clock } from '../../../../shared/application/ports/clock.port';
import { currentEntityManager } from '../../../../shared/infrastructure/database/typeorm-transaction-runner';
import { CLOCK } from '../../../../shared/shared.tokens';
import {
  AccountStep,
  AccountStepKind,
  ClaimedAccountStep,
  PendingAccountSteps,
} from '../../application/ports/pending-account-steps.port';

interface ClaimedRow {
  operation_id: string;
  kind: string;
  user_id: string;
  attempts: number;
}

// The claim is one statement, so the row locks live only as long as it: the rows are picked with
// SKIP LOCKED, which never waits for a step another claim holds, then pushed to the end of the lease
// with the attempt counted. Once it commits, no other claim returns them before then. A lease that
// runs out is how a step whose claimer died comes back.
const CLAIM_DUE = `
  WITH due AS (
    SELECT id FROM customer_account_steps
     WHERE status IN ('ARMED', 'PENDING') AND due_at <= $1
       AND ($4::uuid[] IS NULL OR operation_id = ANY($4::uuid[]))
     ORDER BY due_at, id
     LIMIT $2
       FOR UPDATE SKIP LOCKED
  )
  UPDATE customer_account_steps step
     SET status = 'PENDING', attempts = step.attempts + 1, due_at = $3
    FROM due
   WHERE step.id = due.id
  RETURNING step.operation_id, step.kind, step.user_id, step.attempts
`;

/**
 * The outbox of `customers` over `customer_account_steps`. `disarm` joins the transaction of the
 * caller, so a step is closed with the save it belongs to. Every other write is a statement of its
 * own, committed at once.
 */
@Injectable()
export class TypeOrmPendingAccountSteps implements PendingAccountSteps {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async arm(step: AccountStep, dueAt: Date): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO customer_account_steps
         (operation_id, kind, user_id, payload, status, due_at, created_at)
       VALUES ($1, $2, $3, '{}'::jsonb, 'ARMED', $4, $5)`,
      [step.operationId, step.kind, step.userId, dueAt, this.clock.now()],
    );
  }

  async disarm(operationId: string): Promise<boolean> {
    const manager = currentEntityManager() ?? this.dataSource.manager;
    // A claim turns an armed step pending, so the status condition is what tells a request whether
    // the processor took its step. TypeORM answers an UPDATE with `[rows, rowCount]`.
    const [rows]: [Array<{ id: string }>, number] = await manager.query(
      `UPDATE customer_account_steps
          SET status = 'DONE', completed_at = $2
        WHERE operation_id = $1 AND status = 'ARMED'
        RETURNING id`,
      [operationId, this.clock.now()],
    );
    return rows.length > 0;
  }

  async complete(operationId: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE customer_account_steps
          SET status = 'DONE', completed_at = $2
        WHERE operation_id = $1 AND status IN ('ARMED', 'PENDING')`,
      [operationId, this.clock.now()],
    );
  }

  async release(operationId: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE customer_account_steps
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
  ): Promise<ClaimedAccountStep[]> {
    // TypeORM answers an UPDATE with `[rows, rowCount]`, unlike the plain rows a SELECT answers.
    const [rows]: [ClaimedRow[], number] = await this.dataSource.query(CLAIM_DUE, [
      now,
      limit,
      leaseUntil,
      operationIds ?? null,
    ]);
    return rows.map((row) => ({
      operationId: row.operation_id,
      kind: row.kind as AccountStepKind,
      userId: row.user_id,
      attempts: row.attempts,
    }));
  }

  async recordFailure(operationId: string, error: string, nextDueAt: Date): Promise<void> {
    await this.dataSource.query(
      `UPDATE customer_account_steps
          SET last_error = $2, due_at = $3
        WHERE operation_id = $1 AND status IN ('ARMED', 'PENDING')`,
      [operationId, error, nextDueAt],
    );
  }

  async markFailed(operationId: string, error: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE customer_account_steps
          SET status = 'FAILED', last_error = $2
        WHERE operation_id = $1 AND status IN ('ARMED', 'PENDING')`,
      [operationId, error],
    );
  }
}
