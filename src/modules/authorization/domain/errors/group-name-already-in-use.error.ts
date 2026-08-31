import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class GroupNameAlreadyInUseError extends DomainError {
  readonly code = 'GROUP_NAME_ALREADY_IN_USE';
  readonly kind = ErrorKind.Conflict;

  constructor() {
    super('Group name is already in use.');
  }
}
