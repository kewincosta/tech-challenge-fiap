export enum AccountStepKind {
  DiscardAccount = 'DISCARD_ACCOUNT',
}

/** An account operation customers hands to identity and has to see through. */
export interface AccountStep {
  /** The key the outbox tells the step by. */
  operationId: string;
  kind: AccountStepKind;
  /** The id the registration chose for the account before the account existed. */
  userId: string;
}

/** A step a claim handed out. */
export interface ClaimedAccountStep extends AccountStep {
  /** How many times the step has been claimed, this claim included. */
  attempts: number;
}

/**
 * The outbox of account steps, kept in customers' own table. A registration arms a step before it
 * opens the account and closes it with the last write, so a crash between the two leaves a step
 * behind. A processor claims what is due and applies it, which discards an account no customer
 * ever came to use.
 */
export interface PendingAccountSteps {
  /** Records the step as armed and due at `dueAt`. Commits on its own, whatever transaction is open. */
  arm(step: AccountStep, dueAt: Date): Promise<void>;
  /**
   * Marks an armed step done, in the transaction the caller has open, and says whether it did. A
   * claim turns an armed step pending, so `false` tells the caller that the processor took the
   * step. A step already done or failed answers `false` as well.
   */
  disarm(operationId: string): Promise<boolean>;
  /** Marks the step done. A step already done or failed stays so. */
  complete(operationId: string): Promise<void>;
  /** Makes an armed step due now. Commits on its own. */
  release(operationId: string): Promise<void>;
  /**
   * Claims at most `limit` steps that are due at `now`, restricted to `operationIds` when given, and
   * pushes their due time to `leaseUntil` while counting the attempt, so no other claim returns them
   * before then. A step another claim holds is skipped, never waited for. Commits before it returns.
   */
  claimDue(
    now: Date,
    limit: number,
    leaseUntil: Date,
    operationIds?: string[],
  ): Promise<ClaimedAccountStep[]>;
  /** Keeps the step pending, with the error and the time of its next attempt. */
  recordFailure(operationId: string, error: string, nextDueAt: Date): Promise<void>;
  /** Gives the step up: it stays in its table, failed, for an operator. */
  markFailed(operationId: string, error: string): Promise<void>;
}
