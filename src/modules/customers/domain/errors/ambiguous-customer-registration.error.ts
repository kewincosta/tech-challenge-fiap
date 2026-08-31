import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class AmbiguousCustomerRegistrationError extends DomainError {
  readonly code = 'CUSTOMER_AMBIGUOUS_REGISTRATION';
  readonly kind = ErrorKind.Validation;

  constructor() {
    super('Supply either an existing user id or the data to create one, never both or neither.');
  }
}
