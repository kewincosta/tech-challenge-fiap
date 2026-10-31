import { Clock } from '../../../../shared/application/ports/clock.port';
import { OutboxSettings } from '../outbox-settings';
import { AccountStepLog } from '../ports/account-step-log.port';
import { CustomerAccounts } from '../ports/customer-accounts.port';
import {
  AccountStepKind,
  ClaimedAccountStep,
  PendingAccountSteps,
} from '../ports/pending-account-steps.port';

// The wait after a failed attempt, by attempt: one second, then growing, then an hour for good.
const RETRY_DELAYS_SECONDS = [1, 5, 30, 120, 600, 3600];
const CLAIM_BATCH_SIZE = 20;

/**
 * Applies the account steps through the customer accounts port. Nothing here holds a transaction: a
 * claim commits before the step is applied, and the outcome is recorded after, each in a short write
 * of its own, so applying a step through identity never keeps a connection of this module waiting.
 * Identity discards an account once, and a repeat after a crash changes nothing.
 */
export class AccountStepApplier {
  constructor(
    private readonly steps: PendingAccountSteps,
    private readonly accounts: CustomerAccounts,
    private readonly clock: Clock,
    private readonly log: AccountStepLog,
    private readonly settings: OutboxSettings,
  ) {}

  /** Claims the steps that are due and applies them. */
  applyDue(): Promise<void> {
    return this.claimAndApply();
  }

  /** Claims the due ones among these operations and applies them. */
  applyOperations(operationIds: string[]): Promise<void> {
    return this.claimAndApply(operationIds);
  }

  private async claimAndApply(operationIds?: string[]): Promise<void> {
    const now = this.clock.now();
    const leaseUntil = new Date(now.getTime() + this.settings.graceSeconds * 1000);
    const limit = operationIds ? operationIds.length : CLAIM_BATCH_SIZE;
    const claimed = await this.steps.claimDue(now, limit, leaseUntil, operationIds);
    for (const step of claimed) {
      await this.apply(step);
    }
  }

  private async apply(step: ClaimedAccountStep): Promise<void> {
    try {
      await this.run(step);
      await this.steps.complete(step.operationId);
    } catch (error) {
      await this.fail(step, error instanceof Error ? error.message : String(error));
    }
  }

  private run(step: ClaimedAccountStep): Promise<void> {
    switch (step.kind) {
      case AccountStepKind.DiscardAccount:
        return this.accounts.discard(step.userId);
      default:
        return Promise.reject(new Error(`Unknown account step kind ${String(step.kind)}`));
    }
  }

  private async fail(step: ClaimedAccountStep, error: string): Promise<void> {
    if (step.attempts >= this.settings.maxAttempts) {
      await this.steps.markFailed(step.operationId, error);
      this.log.failed(step, error);
      return;
    }
    const delaySeconds =
      RETRY_DELAYS_SECONDS[Math.min(step.attempts, RETRY_DELAYS_SECONDS.length) - 1];
    const nextDueAt = new Date(this.clock.now().getTime() + delaySeconds * 1000);
    await this.steps.recordFailure(step.operationId, error, nextDueAt);
  }
}
