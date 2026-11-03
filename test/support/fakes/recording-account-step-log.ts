import { AccountStepLog } from '../../../src/modules/customers/application/ports/account-step-log.port';
import { AccountStep } from '../../../src/modules/customers/application/ports/pending-account-steps.port';

/** Records the steps that reached their attempt limit, with the error each one ended on. */
export class RecordingAccountStepLog implements AccountStepLog {
  readonly failures: Array<{ step: AccountStep; lastError: string }> = [];

  failed(step: AccountStep, lastError: string): void {
    this.failures.push({ step, lastError });
  }
}
