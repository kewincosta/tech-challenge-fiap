import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class RoleNameAlreadyInUseError extends DomainError {
  readonly code = 'ROLE_NAME_ALREADY_IN_USE';
  readonly kind = ErrorKind.Conflict;

  constructor() {
    super('Role name is already in use.');
  }
}
