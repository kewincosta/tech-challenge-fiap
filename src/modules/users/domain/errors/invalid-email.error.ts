import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class InvalidEmailError extends DomainError {
  readonly code = 'USER_INVALID_EMAIL';
  readonly kind = ErrorKind.Validation;

  constructor() {
    super('Invalid email address.');
  }
}
