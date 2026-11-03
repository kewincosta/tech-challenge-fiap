import { AccountStep } from './pending-account-steps.port';

export interface AccountStepLog {
  /** The step reached its attempt limit and stays failed until an operator looks at it. */
  failed(step: AccountStep, lastError: string): void;
}
