import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class InvalidServiceDurationError extends DomainError {
  readonly code = 'SERVICE_INVALID_DURATION';
  readonly kind = ErrorKind.Validation;

  constructor() {
    super('Estimated duration must be a positive whole number of minutes.');
  }
}
