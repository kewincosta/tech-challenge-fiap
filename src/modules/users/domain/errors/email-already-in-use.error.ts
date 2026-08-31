import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class EmailAlreadyInUseError extends DomainError {
  readonly code = 'USER_EMAIL_ALREADY_IN_USE';
  readonly kind = ErrorKind.Conflict;

  constructor() {
    super('Email is already in use.');
  }
}
