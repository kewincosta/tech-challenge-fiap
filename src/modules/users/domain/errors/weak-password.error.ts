import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class WeakPasswordError extends DomainError {
  readonly code = 'USER_WEAK_PASSWORD';
  readonly kind = ErrorKind.Validation;

  constructor() {
    super('Password must have between 8 and 128 characters, including letters and digits.');
  }
}
