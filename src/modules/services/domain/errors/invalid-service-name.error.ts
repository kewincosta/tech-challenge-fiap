import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class InvalidServiceNameError extends DomainError {
  readonly code = 'SERVICE_INVALID_NAME';
  readonly kind = ErrorKind.Validation;

  constructor() {
    super('Service name must be between 1 and 120 characters.');
  }
}
