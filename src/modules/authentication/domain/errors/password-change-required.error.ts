import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class PasswordChangeRequiredError extends DomainError {
  readonly code = 'AUTH_PASSWORD_CHANGE_REQUIRED';
  readonly kind = ErrorKind.Forbidden;

  constructor() {
    super('The password must be changed before continuing.');
  }
}
