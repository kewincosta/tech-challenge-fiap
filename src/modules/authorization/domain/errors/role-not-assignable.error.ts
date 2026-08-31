import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class RoleNotAssignableError extends DomainError {
  readonly code = 'AUTHZ_ROLE_NOT_ASSIGNABLE';
  readonly kind = ErrorKind.Forbidden;

  constructor() {
    super('This role cannot be assigned through the API.');
  }
}
