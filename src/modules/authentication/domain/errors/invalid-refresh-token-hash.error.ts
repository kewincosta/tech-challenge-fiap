import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class InvalidRefreshTokenHashError extends DomainError {
  readonly code = 'AUTH_INVALID_REFRESH_TOKEN_HASH';
  readonly kind = ErrorKind.Validation;

  constructor() {
    super('Refresh token hash must not be empty.');
  }
}
