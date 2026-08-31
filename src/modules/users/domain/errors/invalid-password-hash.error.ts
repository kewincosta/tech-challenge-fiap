import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class InvalidPasswordHashError extends DomainError {
  readonly code = 'USER_INVALID_PASSWORD_HASH';
  readonly kind = ErrorKind.Validation;

  constructor() {
    super('Password hash must not be empty.');
  }
}
