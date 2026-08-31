import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class InvalidRoleNameError extends DomainError {
  readonly code = 'ROLE_INVALID_NAME';
  readonly kind = ErrorKind.Validation;

  constructor() {
    super('Role name must be uppercase, start with a letter and have 2 to 50 characters.');
  }
}
