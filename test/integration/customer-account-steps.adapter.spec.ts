import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { TypeOrmTransactionRunner } from '../../src/shared/infrastructure/database/typeorm-transaction-runner';
import {
  AccountStep,
  AccountStepKind,
} from '../../src/modules/customers/application/ports/pending-account-steps.port';
import { TypeOrmPendingAccountSteps } from '../../src/modules/customers/infrastructure/persistence/typeorm-pending-account-steps';
import { FakeClock } from '../support/fakes/fake-clock';
import { createTestDataSource } from '../support/db';

// The test database is never truncated and a claim takes every step that is due, so the spec lives
// in a window of its own: its clock reads 2001, long before any step another spec or a real run
// leaves in the table is due. Each test removes the steps it made.
const START = new Date('2001-01-01T00:00:00.000Z');
const LEFTOVERS_BEFORE = '2002-01-01';

let dataSource: DataSource;
let clock: FakeClock;
let steps: TypeOrmPendingAccountSteps;
let runner: TypeOrmTransactionRunner;
const made: string[] = [];

beforeAll(async () => {
  dataSource = createTestDataSource();
  await dataSource.initialize();
  await dataSource.query(`DELETE FROM customer_account_steps WHERE due_at < $1`, [
    LEFTOVERS_BEFORE,
  ]);
  runner = new TypeOrmTransactionRunner(dataSource);
});

afterEach(async () => {
  await dataSource.query(
    `DELETE FROM customer_account_steps WHERE operation_id = ANY($1::uuid[])`,
    [made.splice(0)],
  );
});

afterAll(async () => {
  await dataSource.destroy();
});

function startClock(): void {
  clock = new FakeClock(START);
  steps = new TypeOrmPendingAccountSteps(dataSource, clock);
}

function newStep(): AccountStep {
  const step: AccountStep = {
    operationId: randomUUID(),
    kind: AccountStepKind.DiscardAccount,
    userId: randomUUID(),
  };
  made.push(step.operationId);
  return step;
}

interface StepRow {
  kind: string;
  user_id: string;
  status: string;
  attempts: number;
  due_at: Date;
  last_error: string | null;
  completed_at: Date | null;
  created_at: Date;
  payload: Record<string, unknown>;
}

async function rowOf(operationId: string): Promise<StepRow | undefined> {
  const rows: StepRow[] = await dataSource.query(
    `SELECT kind, user_id, status, attempts, due_at, last_error, completed_at, created_at, payload
       FROM customer_account_steps
      WHERE operation_id = $1`,
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

describe('TypeOrmPendingAccountSteps', () => {
  describe('arm', () => {
    it('should record the step as ARMED, due when asked, with no attempt and the user it names', async () => {
      startClock();
      const step = newStep();

      await steps.arm(step, at(300));

      expect(await rowOf(step.operationId)).toMatchObject({
        kind: 'DISCARD_ACCOUNT',
        user_id: step.userId,
        status: 'ARMED',
        attempts: 0,
        due_at: at(300),
        last_error: null,
        completed_at: null,
        created_at: START,
      });
    });

    it('should commit on its own, whatever transaction the caller has open', async () => {
      startClock();
      const step = newStep();

      await expect(
        runner.run(async () => {
          await steps.arm(step, at(300));
          throw new Error('the caller fails after arming');
        }),
      ).rejects.toThrow('the caller fails after arming');

      expect((await rowOf(step.operationId))?.status).toBe('ARMED');
    });

    it('should refuse a second step under the same operation id', async () => {
      startClock();
      const step = newStep();
      await steps.arm(step, at(300));

      await expect(steps.arm(step, at(600))).rejects.toThrow(
        /ux_customer_account_steps_operation_id/,
      );
    });
  });

  describe('disarm', () => {
    it('should mark an armed step DONE at the moment of the call and report that it did', async () => {
      startClock();
      const step = newStep();
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
      const rolledBack = newStep();
      const committed = newStep();
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
      const step = newStep();
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
      const done = newStep();
      const disarmed = newStep();
      const failed = newStep();
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
      const armed = newStep();
      const pending = newStep();
      await steps.arm(armed, at(300));
      await steps.arm(pending, at(300));
      await steps.claimDue(at(300), 10, at(900), [pending.operationId]);
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

    it('should leave a done step as it was when completed again, and a failed step failed', async () => {
      startClock();
      const done = newStep();
      const failed = newStep();
      await steps.arm(done, at(300));
      await steps.arm(failed, at(300));
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
      const step = newStep();
      await steps.arm(step, at(300));
      clock.advanceSeconds(20);

      await steps.release(step.operationId);

      expect(await rowOf(step.operationId)).toMatchObject({ status: 'PENDING', due_at: at(20) });
    });

    it('should leave a pending or a done step alone', async () => {
      startClock();
      const pending = newStep();
      const done = newStep();
      await steps.arm(pending, at(300));
      await steps.arm(done, at(300));
      await steps.claimDue(at(300), 10, at(900), [pending.operationId]);
      await steps.complete(done.operationId);
      clock.advanceSeconds(20);

      await steps.release(pending.operationId);
      await steps.release(done.operationId);

      expect(await rowOf(pending.operationId)).toMatchObject({
        status: 'PENDING',
        due_at: at(900),
      });
      expect((await rowOf(done.operationId))?.status).toBe('DONE');
    });
  });

  describe('claimDue', () => {
    it('should hand out the step with its kind, user and attempt, and lease it', async () => {
      startClock();
      const step = newStep();
      await steps.arm(step, at(0));

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
      const step = newStep();
      await steps.arm(step, at(300));

      const early = await steps.claimDue(at(299), 10, at(900), [step.operationId]);
      const recovered = await steps.claimDue(at(300), 10, at(900), [step.operationId]);

      expect(early).toEqual([]);
      expect(recovered.map((claimed) => claimed.operationId)).toEqual([step.operationId]);
    });

    it('should not hand a claimed step out again until its lease runs out, and then count another attempt', async () => {
      startClock();
      const step = newStep();
      await steps.arm(step, at(0));
      await steps.claimDue(at(0), 10, at(300), [step.operationId]);

      const during = await steps.claimDue(at(299), 10, at(900), [step.operationId]);
      const after = await steps.claimDue(at(300), 10, at(900), [step.operationId]);

      expect(during).toEqual([]);
      expect(after).toMatchObject([{ operationId: step.operationId, attempts: 2 }]);
    });

    it('should take at most the limit, the earliest due first', async () => {
      startClock();
      const first = newStep();
      const second = newStep();
      const third = newStep();
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
      const wanted = newStep();
      const other = newStep();
      await steps.arm(wanted, at(0));
      await steps.arm(other, at(0));

      const claimed = await steps.claimDue(at(0), 10, at(300), [wanted.operationId]);

      expect(claimed.map((step) => step.operationId)).toEqual([wanted.operationId]);
      expect(await rowOf(other.operationId)).toMatchObject({ status: 'ARMED', attempts: 0 });
    });

    it('should not take a step that is done or failed', async () => {
      startClock();
      const done = newStep();
      const failed = newStep();
      await steps.arm(done, at(0));
      await steps.arm(failed, at(0));
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
      const held = newStep();
      const free = newStep();
      await steps.arm(held, at(0));
      await steps.arm(free, at(0));
      const holder = dataSource.createQueryRunner();
      await holder.connect();
      await holder.startTransaction();
      await holder.query(
        `SELECT id FROM customer_account_steps WHERE operation_id = $1 FOR UPDATE`,
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
      const all = Array.from({ length: 8 }, () => newStep());
      for (const step of all) {
        await steps.arm(step, at(0));
      }

      const [first, second] = await Promise.all([
        steps.claimDue(at(0), 8, at(300)),
        steps.claimDue(at(0), 8, at(300)),
      ]);

      const claimedIds = [...first, ...second].map((step) => step.operationId);
      expect(new Set(claimedIds).size).toBe(claimedIds.length);
      expect([...claimedIds].sort()).toEqual(all.map((step) => step.operationId).sort());
    });
  });

  describe('recordFailure and markFailed', () => {
    it('should keep a failed attempt pending with its error and the time of the next one', async () => {
      startClock();
      const step = newStep();
      await steps.arm(step, at(0));
      await steps.claimDue(at(0), 10, at(300), [step.operationId]);

      await steps.recordFailure(step.operationId, 'identity is busy', at(1));

      expect(await rowOf(step.operationId)).toMatchObject({
        status: 'PENDING',
        attempts: 1,
        due_at: at(1),
        last_error: 'identity is busy',
      });
      const retried = await steps.claimDue(at(1), 10, at(300), [step.operationId]);
      expect(retried).toMatchObject([{ operationId: step.operationId, attempts: 2 }]);
    });

    it('should give a step up as FAILED with its last error, for good', async () => {
      startClock();
      const step = newStep();
      await steps.arm(step, at(0));
      await steps.claimDue(at(0), 10, at(300), [step.operationId]);

      await steps.markFailed(step.operationId, 'identity is busy');

      expect(await rowOf(step.operationId)).toMatchObject({
        status: 'FAILED',
        last_error: 'identity is busy',
      });
      expect(await steps.claimDue(at(86_400), 10, at(90_000), [step.operationId])).toEqual([]);
    });

    it('should not touch a step that is already done', async () => {
      startClock();
      const step = newStep();
      await steps.arm(step, at(0));
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
