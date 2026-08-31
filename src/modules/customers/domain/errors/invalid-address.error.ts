import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class InvalidAddressError extends DomainError {
  readonly code = 'CUSTOMER_INVALID_ADDRESS';
  readonly kind = ErrorKind.Validation;

  constructor() {
    super('Invalid address.');
  }
}
