import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class CustomerNotFoundError extends DomainError {
  readonly code = 'CUSTOMER_NOT_FOUND';
  readonly kind = ErrorKind.NotFound;

  constructor() {
    super('Customer not found.');
  }
}
