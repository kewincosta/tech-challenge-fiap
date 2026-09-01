import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class DiscountExceedsChargedTotalError extends DomainError {
  readonly code = 'WORK_ORDER_DISCOUNT_EXCEEDS_CHARGED_TOTAL';
  readonly kind = ErrorKind.RuleViolation;

  constructor() {
    super('The discount cannot exceed the work order\'s charged total.');
  }
}
