import { Injectable, Logger } from '@nestjs/common';
import { AccountStepLog } from '../../application/ports/account-step-log.port';
import { AccountStep } from '../../application/ports/pending-account-steps.port';

@Injectable()
export class NestAccountStepLog implements AccountStepLog {
  private readonly logger = new Logger('AccountStepOutbox');

  failed(step: AccountStep, lastError: string): void {
    this.logger.error(
      `Account step ${step.kind} ${step.operationId} for user ${step.userId} failed for good: ${lastError}`,
    );
  }
}
