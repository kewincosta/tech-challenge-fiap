import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class InvalidUserNameError extends DomainError {
  readonly code = 'USER_INVALID_NAME';
  readonly kind = ErrorKind.Validation;

  constructor() {
    super('Name must have between 2 and 120 characters.');
  }
}
