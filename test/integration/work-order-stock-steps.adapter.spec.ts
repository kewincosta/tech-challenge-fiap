import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { TypeOrmTransactionRunner } from '../../src/shared/infrastructure/database/typeorm-transaction-runner';
import {
  StockStep,
  StockStepKind,
} from '../../src/modules/work-orders/application/ports/pending-stock-steps.port';
import { TypeOrmPendingStockSteps } from '../../src/modules/work-orders/infrastructure/persistence/typeorm-pending-stock-steps';
import { FakeClock } from '../support/fakes/fake-clock';
import { createTestDataSource } from '../support/db';
import { uniqueWorkOrderNumber } from '../support/factories/work-order-number.factory';

// The test database is never truncated and a claim takes every step that is due, so the spec lives
// in a window of its own: its clock reads 2001, long before any step another spec or a real run
// leaves in the table is due. Each test removes the steps it made.
const START = new Date('2001-01-01T00:00:00.000Z');
const LEFTOVERS_BEFORE = '2002-01-01';

let dataSource: DataSource;
let clock: FakeClock;
let steps: TypeOrmPendingStockSteps;
let runner: TypeOrmTransactionRunner;
let actorId: string;
const made: string[] = [];

beforeAll(async () => {
  dataSource = createTestDataSource();
  await dataSource.initialize();
  await dataSource.query(`DELETE FROM work_order_stock_steps WHERE due_at < $1`, [
    LEFTOVERS_BEFORE,
  ]);
  runner = new TypeOrmTransactionRunner(dataSource);
  actorId = randomUUID();
});

afterEach(async () => {
  await dataSource.query(
    `DELETE FROM work_order_stock_steps WHERE operation_id = ANY($1::uuid[])`,
    [made.splice(0)],
  );
});

afterAll(async () => {
  await dataSource.destroy();
});

function startClock(): void {
  clock = new FakeClock(START);
  steps = new TypeOrmPendingStockSteps(dataSource, clock);
}

// A work order over its own freshly created user, customer and vehicle, as the other integration
// specs build one: a dedicated user avoids `ux_customers_user_id`.
async function insertWorkOrder(): Promise<string> {
  const workOrderExternalId = randomUUID();
  const userRows: Array<{ id: number }> = await dataSource.query(
    `INSERT INTO users (external_id, email, password_hash, name, document, status, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, 'hash', 'Jane Doe', $2, 'ACTIVE', now(), now())
     RETURNING id`,
    [`${randomUUID()}@example.com`, Math.random().toString().slice(2, 13)],
  );
  const customerRows: Array<{ id: number }> = await dataSource.query(
    `INSERT INTO customers (external_id, user_id, status, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, 'ACTIVE', now(), now())
     RETURNING id`,
    [userRows[0].id],
  );
  const vehicleRows: Array<{ id: number }> = await dataSource.query(
    `INSERT INTO vehicles (external_id, customer_id, plate, brand, model, year, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, 'Toyota', 'Corolla', 2020, now(), now())
     RETURNING id`,
    [customerRows[0].id, Math.random().toString(36).slice(2, 9).toUpperCase()],
  );
  await dataSource.query(
    `INSERT INTO work_orders (external_id, number, customer_id, vehicle_id, created_by_user_id, status, customer_name, vehicle_plate, vehicle_brand, vehicle_model, vehicle_year, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'IN_EXECUTION', 'Jane Doe', 'ABC1234', 'Toyota', 'Corolla', 2020, now(), now())`,
    [
      workOrderExternalId,
      uniqueWorkOrderNumber(),
      customerRows[0].id,
      vehicleRows[0].id,
      userRows[0].id,
    ],
  );
  return workOrderExternalId;
}

async function newStep(
  overrides: Partial<StockStep> & { workOrderId?: string } = {},
): Promise<StockStep> {
  const step: StockStep = {
    operationId: randomUUID(),
    kind: StockStepKind.UndoConsumption,
    workOrderId: overrides.workOrderId ?? (await insertWorkOrder()),
    actorUserId: actorId,
    ...overrides,
  };
  made.push(step.operationId);
  return step;
}

interface StepRow {
  kind: string;
  status: string;
  attempts: number;
  due_at: Date;
  last_error: string | null;
  completed_at: Date | null;
  created_at: Date;
  payload: { actorUserId: string; lines?: Array<{ inventoryItemId: string; quantity: number }> };
  work_order_external_id: string;
}

async function rowOf(operationId: string): Promise<StepRow | undefined> {
  const rows: StepRow[] = await dataSource.query(
    `SELECT s.kind, s.status, s.attempts, s.due_at, s.last_error, s.completed_at, s.created_at,
            s.payload, wo.external_id AS work_order_external_id
       FROM work_order_stock_steps s
       JOIN work_orders wo ON wo.id = s.work_order_id
      WHERE s.operation_id = $1`,
    [operationId],
  );
  return rows[0];
}

function at(seconds: number): Date {
  return new Date(START.getTime() + seconds * 1000);
}

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error('the claim waited for a step another claim holds')),
        milliseconds,
      ),
    ),
  ]);
}

describe('TypeOrmPendingStockSteps', () => {
  describe('arm', () => {
    it('should record the step as ARMED, due when asked, with no attempt and the actor and lines in its payload', async () => {
      startClock();
      const lines = [{ inventoryItemId: randomUUID(), quantity: 2 }];
      const step = await newStep({ kind: StockStepKind.Restore, lines });

      await steps.arm(step, at(300));

      expect(await rowOf(step.operationId)).toMatchObject({
        kind: 'RESTORE',
        status: 'ARMED',
        attempts: 0,
        due_at: at(300),
        last_error: null,
        completed_at: null,
        created_at: START,
        payload: { actorUserId: actorId, lines },
        work_order_external_id: step.workOrderId,
      });
    });

    it('should commit on its own, whatever transaction the caller has open', async () => {
      startClock();
      const step = await newStep();

      await expect(
        runner.run(async () => {
          await steps.arm(step, at(300));
          throw new Error('the caller fails after arming');
        }),
      ).rejects.toThrow('the caller fails after arming');

      expect((await rowOf(step.operationId))?.status).toBe('ARMED');
    });

    it('should refuse a step for a work order that does not exist', async () => {
      startClock();
      const step = await newStep({ workOrderId: randomUUID() });

      await expect(steps.arm(step, at(300))).rejects.toThrow(/work_orders row for external id/);
    });
  });

  describe('enqueue', () => {
    it('should record the step as PENDING and due now', async () => {
      startClock();
      clock.advanceSeconds(42);
      const step = await newStep({ kind: StockStepKind.Settle });

      await steps.enqueue(step);

      expect(await rowOf(step.operationId)).toMatchObject({
        kind: 'SETTLE',
        status: 'PENDING',
        attempts: 0,
        due_at: at(42),
        payload: { actorUserId: actorId },
      });
    });

    it('should join the transaction of the caller: a rollback leaves no step, a commit leaves it', async () => {
      startClock();
      const rolledBack = await newStep();
      const committed = await newStep();

      await expect(
        runner.run(async () => {
          await steps.enqueue(rolledBack);
          throw new Error('the save fails');
        }),
      ).rejects.toThrow('the save fails');
      await runner.run(() => steps.enqueue(committed));

      expect(await rowOf(rolledBack.operationId)).toBeUndefined();
      expect((await rowOf(committed.operationId))?.status).toBe('PENDING');
    });
  });

  describe('disarm', () => {
    it('should mark an armed step DONE at the moment of the call and report that it did', async () => {
      startClock();
      const step = await newStep();
      await steps.arm(step, at(300));
      clock.advanceSeconds(10);

      const disarmed = await steps.disarm(step.operationId);

      expect(disarmed).toBe(true);
      expect(await rowOf(step.operationId)).toMatchObject({
        status: 'DONE',
        completed_at: at(10),
        attempts: 0,
      });
    });

    it('should join the transaction of the caller: a rollback leaves the step armed, a commit closes it', async () => {
      startClock();
      const rolledBack = await newStep();
      const committed = await newStep();
      await steps.arm(rolledBack, at(300));
      await steps.arm(committed, at(300));

      await expect(
        runner.run(async () => {
          expect(await steps.disarm(rolledBack.operationId)).toBe(true);
          throw new Error('the save fails');
        }),
      ).rejects.toThrow('the save fails');
      await runner.run(() => steps.disarm(committed.operationId));

      expect(await rowOf(rolledBack.operationId)).toMatchObject({
        status: 'ARMED',
        completed_at: null,
      });
      expect((await rowOf(committed.operationId))?.status).toBe('DONE');
    });

    it('should report that a claim took the step and leave it as the claim made it', async () => {
      startClock();
      const step = await newStep();
      await steps.arm(step, at(300));
      await steps.claimDue(at(300), 10, at(900), [step.operationId]);

      const disarmed = await steps.disarm(step.operationId);

      expect(disarmed).toBe(false);
      expect(await rowOf(step.operationId)).toMatchObject({
        status: 'PENDING',
        attempts: 1,
        due_at: at(900),
        completed_at: null,
      });
    });

    it('should report false for a step already done, a step already disarmed and a step that failed', async () => {
      startClock();
      const done = await newStep();
      const disarmed = await newStep();
      const failed = await newStep();
      await steps.arm(done, at(300));
      await steps.arm(disarmed, at(300));
      await steps.arm(failed, at(300));
      await steps.complete(done.operationId);
      await steps.disarm(disarmed.operationId);
      await steps.markFailed(failed.operationId, 'gave up');
      clock.advanceSeconds(60);

      const results = [
        await steps.disarm(done.operationId),
        await steps.disarm(disarmed.operationId),
        await steps.disarm(failed.operationId),
      ];

      expect(results).toEqual([false, false, false]);
      expect(await rowOf(done.operationId)).toMatchObject({ status: 'DONE', completed_at: at(0) });
      expect(await rowOf(disarmed.operationId)).toMatchObject({
        status: 'DONE',
        completed_at: at(0),
      });
      expect(await rowOf(failed.operationId)).toMatchObject({
        status: 'FAILED',
        last_error: 'gave up',
      });
    });

    it('should report false for an operation that has no step', async () => {
      startClock();

      expect(await steps.disarm(randomUUID())).toBe(false);
    });
  });

  describe('complete', () => {
    it('should mark an armed or a pending step DONE at the moment of the call', async () => {
      startClock();
      const armed = await newStep();
      const pending = await newStep();
      await steps.arm(armed, at(300));
      await steps.enqueue(pending);
      clock.advanceSeconds(10);

      await steps.complete(armed.operationId);
      await steps.complete(pending.operationId);

      expect(await rowOf(armed.operationId)).toMatchObject({
        status: 'DONE',
        completed_at: at(10),
      });
      expect(await rowOf(pending.operationId)).toMatchObject({
        status: 'DONE',
        completed_at: at(10),
      });
    });

    it('should join the transaction of the caller: a rollback leaves the step armed', async () => {
      startClock();
      const step = await newStep();
      await steps.arm(step, at(300));

      await expect(
        runner.run(async () => {
          await steps.complete(step.operationId);
          throw new Error('the save fails');
        }),
      ).rejects.toThrow('the save fails');

      expect(await rowOf(step.operationId)).toMatchObject({ status: 'ARMED', completed_at: null });
    });

    it('should leave a done step as it was when completed again, and a failed step failed', async () => {
      startClock();
      const done = await newStep();
      const failed = await newStep();
      await steps.enqueue(done);
      await steps.enqueue(failed);
      await steps.complete(done.operationId);
      await steps.markFailed(failed.operationId, 'gave up');
      clock.advanceSeconds(60);

      await steps.complete(done.operationId);
      await steps.complete(failed.operationId);

      expect(await rowOf(done.operationId)).toMatchObject({ status: 'DONE', completed_at: at(0) });
      expect(await rowOf(failed.operationId)).toMatchObject({
        status: 'FAILED',
        completed_at: null,
        last_error: 'gave up',
      });
    });
  });

  describe('release', () => {
    it('should make an armed step pending and due now', async () => {
      startClock();
      const step = await newStep();
      await steps.arm(step, at(300));
      clock.advanceSeconds(20);

      await steps.release(step.operationId);

      expect(await rowOf(step.operationId)).toMatchObject({ status: 'PENDING', due_at: at(20) });
    });

    it('should leave a pending or a done step alone', async () => {
      startClock();
      const pending = await newStep();
      const done = await newStep();
      await steps.enqueue(pending);
      await steps.enqueue(done);
      await steps.complete(done.operationId);
      clock.advanceSeconds(20);

      await steps.release(pending.operationId);
      await steps.release(done.operationId);

      expect(await rowOf(pending.operationId)).toMatchObject({ status: 'PENDING', due_at: at(0) });
      expect((await rowOf(done.operationId))?.status).toBe('DONE');
    });
  });

  describe('claimDue', () => {
    it('should hand out the step with its kind, work order, actor, lines and attempt, and lease it', async () => {
      startClock();
      const lines = [{ inventoryItemId: randomUUID(), quantity: 3 }];
      const step = await newStep({ kind: StockStepKind.Restore, lines });
      await steps.enqueue(step);

      const claimed = await steps.claimDue(at(0), 10, at(300), [step.operationId]);

      expect(claimed).toEqual([{ ...step, attempts: 1 }]);
      expect(await rowOf(step.operationId)).toMatchObject({
        status: 'PENDING',
        attempts: 1,
        due_at: at(300),
      });
    });

    it('should leave a step until it is due, then claim it: an armed step is recovered past its grace period', async () => {
      startClock();
      const step = await newStep();
      await steps.arm(step, at(300));

      const early = await steps.claimDue(at(299), 10, at(900), [step.operationId]);
      const recovered = await steps.claimDue(at(300), 10, at(900), [step.operationId]);

      expect(early).toEqual([]);
      expect(recovered.map((claimed) => claimed.operationId)).toEqual([step.operationId]);
    });

    it('should not hand a claimed step out again until its lease runs out, and then count another attempt', async () => {
      startClock();
      const step = await newStep();
      await steps.enqueue(step);
      await steps.claimDue(at(0), 10, at(300), [step.operationId]);

      const during = await steps.claimDue(at(299), 10, at(900), [step.operationId]);
      const after = await steps.claimDue(at(300), 10, at(900), [step.operationId]);

      expect(during).toEqual([]);
      expect(after).toMatchObject([{ operationId: step.operationId, attempts: 2 }]);
    });

    it('should take at most the limit, the earliest due first', async () => {
      startClock();
      const first = await newStep();
      const second = await newStep();
      const third = await newStep();
      await steps.arm(third, at(30));
      await steps.arm(first, at(10));
      await steps.arm(second, at(20));

      const claimed = await steps.claimDue(at(60), 2, at(900));

      expect(claimed.map((step) => step.operationId)).toEqual([
        first.operationId,
        second.operationId,
      ]);
      expect((await rowOf(third.operationId))?.attempts).toBe(0);
    });

    it('should take only the operations it is given', async () => {
      startClock();
      const wanted = await newStep();
      const other = await newStep();
      await steps.enqueue(wanted);
      await steps.enqueue(other);

      const claimed = await steps.claimDue(at(0), 10, at(300), [wanted.operationId]);

      expect(claimed.map((step) => step.operationId)).toEqual([wanted.operationId]);
      expect(await rowOf(other.operationId)).toMatchObject({ status: 'PENDING', attempts: 0 });
    });

    it('should not take a step that is done or failed', async () => {
      startClock();
      const done = await newStep();
      const failed = await newStep();
      await steps.enqueue(done);
      await steps.enqueue(failed);
      await steps.complete(done.operationId);
      await steps.markFailed(failed.operationId, 'gave up');

      const claimed = await steps.claimDue(at(3600), 10, at(7200), [
        done.operationId,
        failed.operationId,
      ]);

      expect(claimed).toEqual([]);
    });

    it('should skip a step another transaction holds without waiting for it', async () => {
      startClock();
      const held = await newStep();
      const free = await newStep();
      await steps.enqueue(held);
      await steps.enqueue(free);
      const holder = dataSource.createQueryRunner();
      await holder.connect();
      await holder.startTransaction();
      await holder.query(
        `SELECT id FROM work_order_stock_steps WHERE operation_id = $1 FOR UPDATE`,
        [held.operationId],
      );
      let whileHeld: string[];
      try {
        whileHeld = (
          await withTimeout(
            steps.claimDue(at(0), 10, at(300), [held.operationId, free.operationId]),
            3000,
          )
        ).map((step) => step.operationId);
      } finally {
        await holder.commitTransaction();
        await holder.release();
      }

      const afterRelease = await steps.claimDue(at(0), 10, at(300), [
        held.operationId,
        free.operationId,
      ]);

      expect(whileHeld).toEqual([free.operationId]);
      expect(afterRelease.map((step) => step.operationId)).toEqual([held.operationId]);
    });

    it('should never hand the same step to two claims running together', async () => {
      startClock();
      const all = await Promise.all(Array.from({ length: 8 }, () => newStep()));
      for (const step of all) {
        await steps.enqueue(step);
      }

      const [first, second] = await Promise.all([
        steps.claimDue(at(0), 8, at(300)),
        steps.claimDue(at(0), 8, at(300)),
      ]);

      const claimedIds = [...first, ...second].map((step) => step.operationId);
      expect(new Set(claimedIds).size).toBe(claimedIds.length);
      expect([...claimedIds].sort()).toEqual(all.map((step) => step.operationId).sort());
    });

    describe('the steps of one work order', () => {
      it.each<[string, (older: StockStep) => Promise<void>]>([
        ['armed', (older) => steps.arm(older, at(300))],
        ['pending', (older) => steps.enqueue(older)],
      ])(
        'should not claim a step while an older step of its work order is %s, and claim it once that step is done',
        async (_state, record) => {
          startClock();
          const workOrderId = await insertWorkOrder();
          const older = await newStep({ workOrderId });
          const newer = await newStep({ workOrderId, kind: StockStepKind.Settle });
          await record(older);
          await steps.enqueue(newer);

          const whileWaiting = await steps.claimDue(at(60), 10, at(900), [newer.operationId]);
          const heldBack = await rowOf(newer.operationId);
          await steps.complete(older.operationId);
          const afterDone = await steps.claimDue(at(60), 10, at(900), [newer.operationId]);

          expect(whileWaiting).toEqual([]);
          expect(heldBack).toMatchObject({ status: 'PENDING', attempts: 0, due_at: at(0) });
          expect(afterDone).toEqual([{ ...newer, attempts: 1 }]);
        },
      );

      it('should hold the later steps of a work order behind a failed step until an operator sets it back to pending', async () => {
        startClock();
        const workOrderId = await insertWorkOrder();
        const failed = await newStep({ workOrderId });
        const later = await newStep({ workOrderId, kind: StockStepKind.Settle });
        await steps.enqueue(failed);
        await steps.enqueue(later);
        await steps.claimDue(at(0), 10, at(300), [failed.operationId]);
        await steps.markFailed(failed.operationId, 'gave up');

        const whileFailed = await steps.claimDue(at(86_400), 10, at(90_000), [later.operationId]);
        // The operator fixed the cause and sets the failed step back to pending.
        await dataSource.query(
          `UPDATE work_order_stock_steps SET status = 'PENDING' WHERE operation_id = $1`,
          [failed.operationId],
        );
        const afterRelease = await steps.claimDue(at(86_400), 10, at(90_000), [
          failed.operationId,
          later.operationId,
        ]);
        await steps.complete(failed.operationId);
        const afterDone = await steps.claimDue(at(86_400), 10, at(90_000), [later.operationId]);

        expect(whileFailed).toEqual([]);
        expect(afterRelease.map((step) => step.operationId)).toEqual([failed.operationId]);
        expect(afterDone.map((step) => step.operationId)).toEqual([later.operationId]);
      });

      it('should claim a step of another work order while the steps of one work order wait', async () => {
        startClock();
        const waitingOrder = await insertWorkOrder();
        const otherOrder = await insertWorkOrder();
        const older = await newStep({ workOrderId: waitingOrder });
        const newer = await newStep({ workOrderId: waitingOrder });
        const other = await newStep({ workOrderId: otherOrder });
        await steps.arm(older, at(300));
        await steps.enqueue(newer);
        await steps.enqueue(other);

        const claimed = await steps.claimDue(at(60), 10, at(900), [
          newer.operationId,
          other.operationId,
        ]);

        expect(claimed.map((step) => step.operationId)).toEqual([other.operationId]);
        expect(await rowOf(newer.operationId)).toMatchObject({ status: 'PENDING', attempts: 0 });
      });

      it('should take at most one step per work order in a claim, the oldest that is not done', async () => {
        startClock();
        const firstOrder = await insertWorkOrder();
        const secondOrder = await insertWorkOrder();
        const first = await newStep({ workOrderId: firstOrder });
        const second = await newStep({ workOrderId: firstOrder });
        const third = await newStep({ workOrderId: firstOrder });
        const elsewhere = await newStep({ workOrderId: secondOrder });
        for (const step of [first, second, third, elsewhere]) {
          await steps.enqueue(step);
        }

        const claimed = await steps.claimDue(at(0), 10, at(300));
        await steps.complete(first.operationId);
        const next = await steps.claimDue(at(0), 10, at(300));

        expect(claimed.map((step) => step.operationId).sort()).toEqual(
          [first.operationId, elsewhere.operationId].sort(),
        );
        expect(next.map((step) => step.operationId)).toEqual([second.operationId]);
        expect(await rowOf(third.operationId)).toMatchObject({ status: 'PENDING', attempts: 0 });
      });

      it('should never hand the same step to two claims running together, and leave the later step of each work order', async () => {
        startClock();
        const pairs: Array<[StockStep, StockStep]> = [];
        for (let index = 0; index < 4; index += 1) {
          const workOrderId = await insertWorkOrder();
          const older = await newStep({ workOrderId });
          const newer = await newStep({ workOrderId });
          await steps.enqueue(older);
          await steps.enqueue(newer);
          pairs.push([older, newer]);
        }

        const [first, second] = await Promise.all([
          steps.claimDue(at(0), 8, at(300)),
          steps.claimDue(at(0), 8, at(300)),
        ]);

        const claimedIds = [...first, ...second].map((step) => step.operationId);
        expect(new Set(claimedIds).size).toBe(claimedIds.length);
        expect([...claimedIds].sort()).toEqual(pairs.map(([older]) => older.operationId).sort());
        for (const [, newer] of pairs) {
          expect(await rowOf(newer.operationId)).toMatchObject({ status: 'PENDING', attempts: 0 });
        }
      });
    });
  });

  describe('recordFailure and markFailed', () => {
    it('should keep a failed attempt pending with its error and the time of the next one', async () => {
      startClock();
      const step = await newStep();
      await steps.enqueue(step);
      await steps.claimDue(at(0), 10, at(300), [step.operationId]);

      await steps.recordFailure(step.operationId, 'inventory is busy', at(1));

      expect(await rowOf(step.operationId)).toMatchObject({
        status: 'PENDING',
        attempts: 1,
        due_at: at(1),
        last_error: 'inventory is busy',
      });
      const retried = await steps.claimDue(at(1), 10, at(300), [step.operationId]);
      expect(retried).toMatchObject([{ operationId: step.operationId, attempts: 2 }]);
    });

    it('should give a step up as FAILED with its last error, for good', async () => {
      startClock();
      const step = await newStep();
      await steps.enqueue(step);
      await steps.claimDue(at(0), 10, at(300), [step.operationId]);

      await steps.markFailed(step.operationId, 'inventory is busy');

      expect(await rowOf(step.operationId)).toMatchObject({
        status: 'FAILED',
        last_error: 'inventory is busy',
      });
      expect(await steps.claimDue(at(86_400), 10, at(90_000), [step.operationId])).toEqual([]);
    });

    it('should not touch a step that is already done', async () => {
      startClock();
      const step = await newStep();
      await steps.enqueue(step);
      await steps.complete(step.operationId);

      await steps.recordFailure(step.operationId, 'late failure', at(60));
      await steps.markFailed(step.operationId, 'late failure');

      expect(await rowOf(step.operationId)).toMatchObject({
        status: 'DONE',
        last_error: null,
        due_at: at(0),
      });
    });
  });
});
