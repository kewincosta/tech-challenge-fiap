import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class CustomerAlreadyExistsForUserError extends DomainError {
  readonly code = 'CUSTOMER_ALREADY_EXISTS_FOR_USER';
  readonly kind = ErrorKind.Conflict;

  constructor() {
    super('A customer record already exists for this user.');
  }
}
