import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class WithdrawalExceedsPlannedError extends DomainError {
  readonly code = 'WORK_ORDER_WITHDRAWAL_EXCEEDS_PLANNED';
  readonly kind = ErrorKind.RuleViolation;

  constructor() {
    super('This withdrawal would take the item past its planned quantity.');
  }
}
