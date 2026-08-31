import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class RoleNotFoundError extends DomainError {
  readonly code = 'ROLE_NOT_FOUND';
  readonly kind = ErrorKind.NotFound;

  constructor() {
    super('Role not found.');
  }
}
