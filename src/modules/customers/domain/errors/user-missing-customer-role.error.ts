import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class UserMissingCustomerRoleError extends DomainError {
  readonly code = 'CUSTOMER_USER_MISSING_CUSTOMER_ROLE';
  readonly kind = ErrorKind.RuleViolation;

  constructor() {
    super('The target user does not hold the CUSTOMER role.');
  }
}
