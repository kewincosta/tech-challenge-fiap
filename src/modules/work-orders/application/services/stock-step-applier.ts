import { Clock } from '../../../../shared/application/ports/clock.port';
import { OutboxSettings } from '../outbox-settings';
import {
  ClaimedStockStep,
  PendingStockSteps,
  StockStepKind,
} from '../ports/pending-stock-steps.port';
import { StockLedger } from '../ports/stock-ledger.port';
import { StockStepLog } from '../ports/stock-step-log.port';

// The wait after a failed attempt, by attempt: one second, then growing, then an hour for good.
const RETRY_DELAYS_SECONDS = [1, 5, 30, 120, 600, 3600];
const CLAIM_BATCH_SIZE = 20;

/**
 * Applies the stock steps through the stock ledger. Nothing here holds a transaction: a claim
 * commits before the step is applied, and the outcome is recorded after, each in a short write of
 * its own, so applying a step through inventory never keeps a connection of this module waiting.
 * Inventory applies every step once per operation, which makes a repeat after a crash harmless.
 */
export class StockStepApplier {
  constructor(
    private readonly steps: PendingStockSteps,
    private readonly ledger: StockLedger,
    private readonly clock: Clock,
    private readonly log: StockStepLog,
    private readonly settings: OutboxSettings,
  ) {}

  /** Claims the steps that are due and applies them. */
  applyDue(): Promise<void> {
    return this.claimAndApply();
  }

  /**
   * Claims the due ones among these operations and applies them: the attempt a request makes on its
   * own step, sharing the claim with the processor so the two never apply a step together.
   */
  applyOperations(operationIds: string[]): Promise<void> {
    return this.claimAndApply(operationIds);
  }

  /**
   * The attempt a request makes at a step it enqueued, once the transaction that recorded the step
   * has committed. It never fails the request: whatever goes wrong, the claim included, the step
   * stays in the outbox and the processor applies it when it is due.
   */
  async applyAfterCommit(operationId: string): Promise<void> {
    try {
      await this.applyOperations([operationId]);
    } catch {
      // The step is still pending. The request already has what it needs, the saved work order.
    }
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

  private async apply(step: ClaimedStockStep): Promise<void> {
    try {
      await this.run(step);
      await this.steps.complete(step.operationId);
    } catch (error) {
      await this.fail(step, error instanceof Error ? error.message : String(error));
    }
  }

  private run(step: ClaimedStockStep): Promise<void> {
    switch (step.kind) {
      case StockStepKind.UndoConsumption:
        return this.ledger.undoConsumption(step.operationId, step.actorUserId);
      case StockStepKind.ConfirmConsumption:
        // A confirmation without the withdrawal's operation id confirms nothing. Failing the step
        // lets its attempts run out and puts it in front of an operator.
        if (step.consumptionOperationId === undefined) {
          return Promise.reject(
            new Error('A confirmation step carries no consumption operation id'),
          );
        }
        return this.ledger.confirmConsumption(step.consumptionOperationId, step.actorUserId);
      case StockStepKind.Restore:
        return this.ledger.restore(
          step.workOrderId,
          step.lines ?? [],
          step.actorUserId,
          step.operationId,
        );
      case StockStepKind.Settle:
        return this.ledger.settle(step.workOrderId, step.actorUserId);
      case StockStepKind.WriteOff:
        return this.ledger.writeOff(step.workOrderId, step.actorUserId);
      default:
        return Promise.reject(new Error(`Unknown stock step kind ${String(step.kind)}`));
    }
  }

  private async fail(step: ClaimedStockStep, error: string): Promise<void> {
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
