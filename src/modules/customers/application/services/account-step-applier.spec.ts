import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../../../../test/support/fakes/fake-clock';
import { FakeCustomerAccounts } from '../../../../../test/support/fakes/fake-customer-accounts';
import { FakePendingAccountSteps } from '../../../../../test/support/fakes/fake-pending-account-steps';
import { RecordingAccountStepLog } from '../../../../../test/support/fakes/recording-account-step-log';
import { OutboxSettings } from '../outbox-settings';
import { AccountStep, AccountStepKind } from '../ports/pending-account-steps.port';
import { AccountStepApplier } from './account-step-applier';

const OPERATION_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_OPERATION_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_USER_ID = '44444444-4444-4444-8444-444444444444';

function stepOf(operationId = OPERATION_ID, userId = USER_ID): AccountStep {
  return { operationId, kind: AccountStepKind.DiscardAccount, userId };
}

function makeApplier(
  overrides: Partial<OutboxSettings> = {},
  accounts = new FakeCustomerAccounts({ userId: USER_ID, temporaryPassword: 'x' }),
) {
  const clock = new FakeClock();
  const steps = new FakePendingAccountSteps(clock);
  const log = new RecordingAccountStepLog();
  const settings: OutboxSettings = {
    pollIntervalMs: 5000,
    graceSeconds: 300,
    maxAttempts: 10,
    ...overrides,
  };
  const applier = new AccountStepApplier(steps, accounts, clock, log, settings);
  return { applier, steps, accounts, log, clock, settings };
}

describe('AccountStepApplier', () => {
  describe('applying a step through the accounts port', () => {
    it('discards the account the step names', async () => {
      const { applier, steps, accounts } = makeApplier();
      steps.seed(stepOf());

      await applier.applyDue();

      expect(accounts.discarded).toEqual([USER_ID]);
    });

    it('completes the step once the account is discarded, whatever attempt that is', async () => {
      const { applier, steps } = makeApplier();
      steps.seed(stepOf(), { attempts: 3, lastError: 'identity is busy' });

      await applier.applyDue();

      expect(steps.stateOf(OPERATION_ID)).toMatchObject({ status: 'DONE', attempts: 4 });
    });

    it('applies a step once: a second run finds it done', async () => {
      const { applier, steps, accounts } = makeApplier();
      steps.seed(stepOf());

      await applier.applyDue();
      await applier.applyDue();

      expect(accounts.discarded).toHaveLength(1);
    });
  });

  describe('choosing the steps', () => {
    it('leaves a step alone until it is due', async () => {
      const { applier, steps, accounts, clock } = makeApplier();
      steps.seed(stepOf(), {
        status: 'ARMED',
        dueAt: new Date(clock.now().getTime() + 300_000),
      });

      await applier.applyDue();

      expect(accounts.discarded).toEqual([]);
      expect(steps.stateOf(OPERATION_ID)).toMatchObject({ status: 'ARMED', attempts: 0 });
    });

    it('applies an armed step once the grace period has passed', async () => {
      const { applier, steps, accounts, clock } = makeApplier();
      steps.seed(stepOf(), {
        status: 'ARMED',
        dueAt: new Date(clock.now().getTime() + 300_000),
      });
      clock.advanceSeconds(300);

      await applier.applyDue();

      expect(accounts.discarded).toEqual([USER_ID]);
      expect(steps.stateOf(OPERATION_ID).status).toBe('DONE');
    });

    it('applies only the operations it is given', async () => {
      const { applier, steps, accounts } = makeApplier();
      steps.seed(stepOf(OTHER_OPERATION_ID, OTHER_USER_ID));
      steps.seed(stepOf(OPERATION_ID, USER_ID));

      await applier.applyOperations([OPERATION_ID]);

      expect(accounts.discarded).toEqual([USER_ID]);
      expect(steps.stateOf(OPERATION_ID).status).toBe('DONE');
      expect(steps.stateOf(OTHER_OPERATION_ID)).toMatchObject({ status: 'PENDING', attempts: 0 });
    });

    it('claims a step for the grace period, so another run does not apply it meanwhile', async () => {
      class HangingAccounts extends FakeCustomerAccounts {
        finish: () => void = () => undefined;

        override discard(): Promise<void> {
          return new Promise<void>((resolve) => {
            this.finish = resolve;
          });
        }
      }
      const accounts = new HangingAccounts({ userId: USER_ID, temporaryPassword: 'x' });
      const { applier, steps, clock } = makeApplier({ graceSeconds: 300 }, accounts);
      steps.seed(stepOf());
      const claimedAt = clock.now();

      const running = applier.applyDue();
      await new Promise((resolve) => setImmediate(resolve));

      expect(steps.stateOf(OPERATION_ID)).toMatchObject({
        status: 'PENDING',
        attempts: 1,
        dueAt: new Date(claimedAt.getTime() + 300_000),
      });
      accounts.finish();
      await running;
      expect(steps.stateOf(OPERATION_ID).status).toBe('DONE');
    });
  });

  describe('when identity refuses a step', () => {
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
        const { applier, steps, accounts, clock } = makeApplier({ maxAttempts: 10 });
        accounts.refuseDiscardWith(new Error('identity is busy'));
        steps.seed(stepOf(), { attempts: attempt - 1 });

        await applier.applyDue();

        expect(steps.stateOf(OPERATION_ID)).toMatchObject({
          status: 'PENDING',
          attempts: attempt,
          dueAt: new Date(clock.now().getTime() + seconds * 1000),
          lastError: 'identity is busy',
        });
      },
    );

    it('retries the step once the wait is over', async () => {
      const { applier, steps, accounts, clock } = makeApplier();
      steps.seed(stepOf());
      accounts.refuseDiscardWith(new Error('identity is busy'));
      await applier.applyDue();
      expect(accounts.discarded).toEqual([]);

      const recovered = new FakeCustomerAccounts({ userId: USER_ID, temporaryPassword: 'x' });
      const retrying = new AccountStepApplier(
        steps,
        recovered,
        clock,
        new RecordingAccountStepLog(),
        { pollIntervalMs: 5000, graceSeconds: 300, maxAttempts: 10 },
      );
      clock.advanceSeconds(1);
      await retrying.applyDue();

      expect(recovered.discarded).toEqual([USER_ID]);
      expect(steps.stateOf(OPERATION_ID)).toMatchObject({ status: 'DONE', attempts: 2 });
    });

    it('marks the step failed at the attempt limit and logs the kind, the operation, the user and the last error', async () => {
      const { applier, steps, accounts, log } = makeApplier({ maxAttempts: 3 });
      accounts.refuseDiscardWith(new Error('identity is busy'));
      steps.seed(stepOf(), { attempts: 2 });

      await applier.applyDue();

      expect(steps.stateOf(OPERATION_ID)).toMatchObject({
        status: 'FAILED',
        attempts: 3,
        lastError: 'identity is busy',
      });
      expect(log.failures).toEqual([
        { step: { ...stepOf(), attempts: 3 }, lastError: 'identity is busy' },
      ]);
    });

    it('logs nothing before the attempt limit', async () => {
      const { applier, steps, accounts, log } = makeApplier({ maxAttempts: 3 });
      accounts.refuseDiscardWith(new Error('identity is busy'));
      steps.seed(stepOf(), { attempts: 1 });

      await applier.applyDue();

      expect(steps.stateOf(OPERATION_ID).status).toBe('PENDING');
      expect(log.failures).toEqual([]);
    });

    it('keeps a step of a kind it does not know pending with the error, and discards nothing', async () => {
      const { applier, steps, accounts } = makeApplier();
      steps.seed({ ...stepOf(), kind: 'MOVE' as AccountStepKind });

      await applier.applyDue();

      expect(steps.stateOf(OPERATION_ID)).toMatchObject({
        status: 'PENDING',
        lastError: 'Unknown account step kind MOVE',
      });
      expect(accounts.discarded).toEqual([]);
    });

    it('does not let one failing step stop the others in the same run', async () => {
      class RefusingOneUser extends FakeCustomerAccounts {
        override discard(userId: string): Promise<void> {
          return userId === USER_ID
            ? Promise.reject(new Error('identity is busy'))
            : super.discard(userId);
        }
      }
      const { applier, steps, accounts } = makeApplier(
        {},
        new RefusingOneUser({ userId: USER_ID, temporaryPassword: 'x' }),
      );
      steps.seed(stepOf(OPERATION_ID, USER_ID));
      steps.seed(stepOf(OTHER_OPERATION_ID, OTHER_USER_ID));

      await applier.applyDue();

      expect(steps.stateOf(OPERATION_ID).status).toBe('PENDING');
      expect(steps.stateOf(OTHER_OPERATION_ID).status).toBe('DONE');
      expect(accounts.discarded).toEqual([OTHER_USER_ID]);
    });
  });
});
