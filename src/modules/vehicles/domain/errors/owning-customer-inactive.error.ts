import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class OwningCustomerInactiveError extends DomainError {
  readonly code = 'VEHICLE_OWNING_CUSTOMER_INACTIVE';
  readonly kind = ErrorKind.RuleViolation;

  constructor() {
    super('The owning customer is deactivated.');
  }
}
