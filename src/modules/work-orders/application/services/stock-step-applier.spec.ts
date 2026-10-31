import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../../../../test/support/fakes/fake-clock';
import { FakePendingStockSteps } from '../../../../../test/support/fakes/fake-pending-stock-steps';
import { FakeStockLedger } from '../../../../../test/support/fakes/fake-stock-ledger';
import { RecordingStockStepLog } from '../../../../../test/support/fakes/recording-stock-step-log';
import { OutboxSettings } from '../outbox-settings';
import { StockStep, StockStepKind } from '../ports/pending-stock-steps.port';
import { StockStepApplier } from './stock-step-applier';

const OPERATION_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_OPERATION_ID = '22222222-2222-4222-8222-222222222222';
const WORK_ORDER_ID = '33333333-3333-4333-8333-333333333333';
const ACTOR_ID = '44444444-4444-4444-8444-444444444444';
const ITEM_ID = '55555555-5555-4555-8555-555555555555';
const LINES = [{ inventoryItemId: ITEM_ID, quantity: 2 }];

function stepOf(kind: StockStepKind, operationId = OPERATION_ID): StockStep {
  return {
    operationId,
    kind,
    workOrderId: WORK_ORDER_ID,
    actorUserId: ACTOR_ID,
    lines: kind === StockStepKind.Restore ? LINES : undefined,
  };
}

function makeApplier(overrides: Partial<OutboxSettings> = {}, ledger = new FakeStockLedger()) {
  const clock = new FakeClock();
  const steps = new FakePendingStockSteps(clock);
  const log = new RecordingStockStepLog();
  const settings: OutboxSettings = {
    pollIntervalMs: 5000,
    graceSeconds: 300,
    maxAttempts: 10,
    ...overrides,
  };
  const applier = new StockStepApplier(steps, ledger, clock, log, settings);
  return { applier, steps, ledger, log, clock, settings };
}

describe('StockStepApplier', () => {
  describe('applying a step through the ledger', () => {
    it('undoes the consumption of the operation', async () => {
      const { applier, steps, ledger } = makeApplier();
      steps.seed(stepOf(StockStepKind.UndoConsumption));

      await applier.applyDue();

      expect(ledger.undone).toEqual([
        { operationId: OPERATION_ID, actorUserId: ACTOR_ID, insideTransaction: false },
      ]);
      expect([ledger.restored, ledger.settled, ledger.writtenOff]).toEqual([[], [], []]);
    });

    it('restores the lines of the step under its operation id', async () => {
      const { applier, steps, ledger } = makeApplier();
      steps.seed(stepOf(StockStepKind.Restore));

      await applier.applyDue();

      expect(ledger.restored).toEqual([
        {
          workOrderId: WORK_ORDER_ID,
          lines: LINES,
          actorUserId: ACTOR_ID,
          operationId: OPERATION_ID,
          insideTransaction: false,
        },
      ]);
      expect([ledger.undone, ledger.settled, ledger.writtenOff]).toEqual([[], [], []]);
    });

    it('settles the stock of the work order', async () => {
      const { applier, steps, ledger } = makeApplier();
      steps.seed(stepOf(StockStepKind.Settle));

      await applier.applyDue();

      expect(ledger.settled).toEqual([
        { workOrderId: WORK_ORDER_ID, actorUserId: ACTOR_ID, insideTransaction: false },
      ]);
      expect([ledger.undone, ledger.restored, ledger.writtenOff]).toEqual([[], [], []]);
    });

    it('writes the stock of the work order off', async () => {
      const { applier, steps, ledger } = makeApplier();
      steps.seed(stepOf(StockStepKind.WriteOff));

      await applier.applyDue();

      expect(ledger.writtenOff).toEqual([
        { workOrderId: WORK_ORDER_ID, actorUserId: ACTOR_ID, insideTransaction: false },
      ]);
      expect([ledger.undone, ledger.restored, ledger.settled]).toEqual([[], [], []]);
    });

    it('completes the step once the ledger applied it, whatever attempt that is', async () => {
      const { applier, steps } = makeApplier();
      steps.seed(stepOf(StockStepKind.Settle), { attempts: 3, lastError: 'inventory is busy' });

      await applier.applyDue();

      expect(steps.stateOf(OPERATION_ID)).toMatchObject({ status: 'DONE', attempts: 4 });
    });

    it('applies a step once: a second run finds it done', async () => {
      const { applier, steps, ledger } = makeApplier();
      steps.seed(stepOf(StockStepKind.Settle));

      await applier.applyDue();
      await applier.applyDue();

      expect(ledger.settled).toHaveLength(1);
    });
  });

  describe('choosing the steps', () => {
    it('leaves a step alone until it is due', async () => {
      const { applier, steps, ledger, clock } = makeApplier();
      steps.seed(stepOf(StockStepKind.UndoConsumption), {
        status: 'ARMED',
        dueAt: new Date(clock.now().getTime() + 300_000),
      });

      await applier.applyDue();

      expect(ledger.undone).toEqual([]);
      expect(steps.stateOf(OPERATION_ID)).toMatchObject({ status: 'ARMED', attempts: 0 });
    });

    it('applies an armed step once the grace period has passed', async () => {
      const { applier, steps, ledger, clock } = makeApplier();
      steps.seed(stepOf(StockStepKind.UndoConsumption), {
        status: 'ARMED',
        dueAt: new Date(clock.now().getTime() + 300_000),
      });
      clock.advanceSeconds(300);

      await applier.applyDue();

      expect(ledger.undone).toHaveLength(1);
      expect(steps.stateOf(OPERATION_ID).status).toBe('DONE');
    });

    it('applies only the operations it is given', async () => {
      const { applier, steps, ledger } = makeApplier();
      steps.seed(stepOf(StockStepKind.UndoConsumption, OTHER_OPERATION_ID));
      steps.seed(stepOf(StockStepKind.UndoConsumption, OPERATION_ID));

      await applier.applyOperations([OPERATION_ID]);

      expect(ledger.undone.map((undo) => undo.operationId)).toEqual([OPERATION_ID]);
      expect(steps.stateOf(OPERATION_ID).status).toBe('DONE');
      expect(steps.stateOf(OTHER_OPERATION_ID)).toMatchObject({ status: 'PENDING', attempts: 0 });
    });

    it('claims a step for the grace period, so another run does not apply it meanwhile', async () => {
      class HangingLedger extends FakeStockLedger {
        finish: () => void = () => undefined;

        override undoConsumption(): Promise<void> {
          return new Promise<void>((resolve) => {
            this.finish = resolve;
          });
        }
      }
      const ledger = new HangingLedger();
      const { applier, steps, clock } = makeApplier({ graceSeconds: 300 }, ledger);
      steps.seed(stepOf(StockStepKind.UndoConsumption));
      const claimedAt = clock.now();

      const running = applier.applyDue();
      await new Promise((resolve) => setImmediate(resolve));

      expect(steps.stateOf(OPERATION_ID)).toMatchObject({
        status: 'PENDING',
        attempts: 1,
        dueAt: new Date(claimedAt.getTime() + 300_000),
      });
      ledger.finish();
      await running;
      expect(steps.stateOf(OPERATION_ID).status).toBe('DONE');
    });
  });

  describe('when the ledger refuses a step', () => {
    it.each([
      [1, 1],
      [2, 5],
      [3, 30],
      [4, 120],
      [5, 600],
      [6, 3600],
      [7, 3600],
      [9, 3600],
    ])(
      'after attempt %i it keeps the step pending and waits %i seconds',
      async (attempt, seconds) => {
        const { applier, steps, ledger, clock } = makeApplier({ maxAttempts: 10 });
        ledger.refuseWith(new Error('inventory is busy'));
        steps.seed(stepOf(StockStepKind.UndoConsumption), { attempts: attempt - 1 });

        await applier.applyDue();

        expect(steps.stateOf(OPERATION_ID)).toMatchObject({
          status: 'PENDING',
          attempts: attempt,
          dueAt: new Date(clock.now().getTime() + seconds * 1000),
          lastError: 'inventory is busy',
        });
      },
    );

    it('retries the step once the wait is over', async () => {
      const { applier, steps, ledger, clock } = makeApplier();
      steps.seed(stepOf(StockStepKind.UndoConsumption));
      ledger.refuseWith(new Error('inventory is busy'));
      await applier.applyDue();
      expect(ledger.undone).toEqual([]);

      const recovered = new FakeStockLedger();
      const retrying = new StockStepApplier(steps, recovered, clock, new RecordingStockStepLog(), {
        pollIntervalMs: 5000,
        graceSeconds: 300,
        maxAttempts: 10,
      });
      clock.advanceSeconds(1);
      await retrying.applyDue();

      expect(recovered.undone).toHaveLength(1);
      expect(steps.stateOf(OPERATION_ID)).toMatchObject({ status: 'DONE', attempts: 2 });
    });

    it('marks the step failed at the attempt limit and logs the kind, the operation, the work order and the last error', async () => {
      const { applier, steps, ledger, log } = makeApplier({ maxAttempts: 3 });
      ledger.refuseWith(new Error('inventory is busy'));
      steps.seed(stepOf(StockStepKind.Settle), { attempts: 2 });

      await applier.applyDue();

      expect(steps.stateOf(OPERATION_ID)).toMatchObject({
        status: 'FAILED',
        attempts: 3,
        lastError: 'inventory is busy',
      });
      expect(log.failures).toEqual([
        { step: { ...stepOf(StockStepKind.Settle), attempts: 3 }, lastError: 'inventory is busy' },
      ]);
    });

    it('logs nothing before the attempt limit', async () => {
      const { applier, steps, ledger, log } = makeApplier({ maxAttempts: 3 });
      ledger.refuseWith(new Error('inventory is busy'));
      steps.seed(stepOf(StockStepKind.Settle), { attempts: 1 });

      await applier.applyDue();

      expect(steps.stateOf(OPERATION_ID).status).toBe('PENDING');
      expect(log.failures).toEqual([]);
    });

    it('keeps a step of a kind it does not know pending with the error, and applies nothing', async () => {
      const { applier, steps, ledger } = makeApplier();
      steps.seed({ ...stepOf(StockStepKind.Settle), kind: 'MOVE' as StockStepKind });

      await applier.applyDue();

      expect(steps.stateOf(OPERATION_ID)).toMatchObject({
        status: 'PENDING',
        lastError: 'Unknown stock step kind MOVE',
      });
      expect([ledger.undone, ledger.restored, ledger.settled, ledger.writtenOff]).toEqual([
        [],
        [],
        [],
        [],
      ]);
    });

    it('does not let one failing step stop the others in the same run', async () => {
      class RefusingOneOperation extends FakeStockLedger {
        override undoConsumption(operationId: string, actorUserId: string): Promise<void> {
          return operationId === OPERATION_ID
            ? Promise.reject(new Error('inventory is busy'))
            : super.undoConsumption(operationId, actorUserId);
        }
      }
      const { applier, steps, ledger } = makeApplier({}, new RefusingOneOperation());
      steps.seed(stepOf(StockStepKind.UndoConsumption, OPERATION_ID));
      steps.seed(stepOf(StockStepKind.UndoConsumption, OTHER_OPERATION_ID));

      await applier.applyDue();

      expect(steps.stateOf(OPERATION_ID).status).toBe('PENDING');
      expect(steps.stateOf(OTHER_OPERATION_ID).status).toBe('DONE');
      expect(ledger.undone.map((undo) => undo.operationId)).toEqual([OTHER_OPERATION_ID]);
    });
  });

  describe('the attempt a request makes after its commit', () => {
    it('applies the step it names and no other due step', async () => {
      const { applier, steps, ledger } = makeApplier();
      steps.seed(stepOf(StockStepKind.Settle, OTHER_OPERATION_ID));
      steps.seed(stepOf(StockStepKind.Settle, OPERATION_ID));

      await applier.applyAfterCommit(OPERATION_ID);

      expect(ledger.settled).toHaveLength(1);
      expect(steps.stateOf(OPERATION_ID)).toMatchObject({ status: 'DONE', attempts: 1 });
      expect(steps.stateOf(OTHER_OPERATION_ID)).toMatchObject({ status: 'PENDING', attempts: 0 });
    });

    it('leaves the step pending, with the error and the wait, when the ledger refuses it, and does not throw', async () => {
      const { applier, steps, ledger, clock } = makeApplier();
      ledger.refuseWith(new Error('inventory is busy'));
      steps.seed(stepOf(StockStepKind.WriteOff));

      await expect(applier.applyAfterCommit(OPERATION_ID)).resolves.toBeUndefined();

      expect(steps.stateOf(OPERATION_ID)).toMatchObject({
        status: 'PENDING',
        attempts: 1,
        lastError: 'inventory is busy',
        dueAt: new Date(clock.now().getTime() + 1000),
      });
    });

    it('does not throw when the claim itself fails, and applies nothing', async () => {
      const { applier, steps, ledger } = makeApplier();
      steps.seed(stepOf(StockStepKind.Settle));
      steps.claimDue = () => Promise.reject(new Error('the database is down'));

      await expect(applier.applyAfterCommit(OPERATION_ID)).resolves.toBeUndefined();

      expect(ledger.settled).toEqual([]);
      expect(steps.stateOf(OPERATION_ID)).toMatchObject({ status: 'PENDING', attempts: 0 });
    });

    it('does not throw when the failure of the attempt cannot be recorded either', async () => {
      const { applier, steps, ledger } = makeApplier();
      ledger.refuseWith(new Error('inventory is busy'));
      steps.seed(stepOf(StockStepKind.Settle));
      steps.recordFailure = () => Promise.reject(new Error('the database is down'));

      await expect(applier.applyAfterCommit(OPERATION_ID)).resolves.toBeUndefined();

      expect(steps.stateOf(OPERATION_ID)).toMatchObject({ status: 'PENDING', attempts: 1 });
    });
  });
});
