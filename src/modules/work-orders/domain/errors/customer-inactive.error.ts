import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class CustomerInactiveError extends DomainError {
  readonly code = 'WORK_ORDER_CUSTOMER_INACTIVE';
  readonly kind = ErrorKind.RuleViolation;

  constructor() {
    super('The customer is deactivated.');
  }
}
