import { StockLine } from './stock-ledger.port';

export enum StockStepKind {
  UndoConsumption = 'UNDO_CONSUMPTION',
  Restore = 'RESTORE',
  Settle = 'SETTLE',
  WriteOff = 'WRITE_OFF',
}

/** A stock operation work-orders hands to inventory and has to see through. */
export interface StockStep {
  /** The key inventory applies the step by, so a repeat changes nothing. */
  operationId: string;
  kind: StockStepKind;
  workOrderId: string;
  actorUserId: string;
  /** Only a restore carries lines. */
  lines?: StockLine[];
}

/** A step a claim handed out. */
export interface ClaimedStockStep extends StockStep {
  /** How many times the step has been claimed, this claim included. */
  attempts: number;
}

/**
 * The outbox of stock steps, kept in work-orders' own table. A step is armed before the first write
 * of a flow and completed with the last one, or enqueued with the save and applied after the commit.
 * A processor claims what is due and applies it, so a crash between two writes leaves a step behind
 * that finishes the flow.
 */
export interface PendingStockSteps {
  /** Records the step as armed and due at `dueAt`. Commits on its own, whatever transaction is open. */
  arm(step: StockStep, dueAt: Date): Promise<void>;
  /** Records the step as pending and due now, in the transaction the caller has open. */
  enqueue(step: StockStep): Promise<void>;
  /**
   * Marks an armed step done, in the transaction the caller has open, and says whether it did. A
   * claim turns an armed step pending, so `false` tells the caller that the processor took the
   * step. A step already done or failed answers `false` as well.
   */
  disarm(operationId: string): Promise<boolean>;
  /** Marks the step done, in the transaction the caller has open. A step already done or failed stays so. */
  complete(operationId: string): Promise<void>;
  /** Makes an armed step due now. Commits on its own. */
  release(operationId: string): Promise<void>;
  /**
   * Claims at most `limit` steps that are due at `now`, restricted to `operationIds` when given, and
   * pushes their due time to `leaseUntil` while counting the attempt, so no other claim returns them
   * before then. A step another claim holds is skipped, never waited for. Commits before it returns.
   *
   * The steps of a work order apply in the order they were recorded. A step is claimed only while no
   * older step of its work order is armed, pending or failed, so a claim takes at most one step per
   * work order, the oldest that is not done. A failed step holds the later steps of its work order
   * until an operator sets it back to pending. The steps of other work orders are not held.
   */
  claimDue(
    now: Date,
    limit: number,
    leaseUntil: Date,
    operationIds?: string[],
  ): Promise<ClaimedStockStep[]>;
  /** Keeps the step pending, with the error and the time of its next attempt. */
  recordFailure(operationId: string, error: string, nextDueAt: Date): Promise<void>;
  /** Gives the step up: it stays in its table, failed, for an operator. */
  markFailed(operationId: string, error: string): Promise<void>;
}
