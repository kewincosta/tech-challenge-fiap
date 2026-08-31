import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class AssignedUserNotFoundError extends DomainError {
  readonly code = 'USER_NOT_FOUND';
  readonly kind = ErrorKind.NotFound;

  constructor() {
    super('User not found.');
  }
}
