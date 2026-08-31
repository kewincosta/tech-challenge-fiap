import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class RefreshTokenReuseError extends DomainError {
  readonly code = 'AUTH_INVALID_REFRESH_TOKEN';
  readonly kind = ErrorKind.Unauthorized;

  constructor() {
    super('Invalid refresh token.');
  }
}
