import { DomainError } from '../../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../../shared/domain/errors/error-kind';

export class AccountInUseError extends DomainError {
  readonly code = 'ACCOUNT_IN_USE';
  readonly kind = ErrorKind.Conflict;

  constructor() {
    super('The account is in use and cannot be discarded.');
  }
}
