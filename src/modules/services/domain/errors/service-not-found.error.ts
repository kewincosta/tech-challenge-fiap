import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class ServiceNotFoundError extends DomainError {
  readonly code = 'SERVICE_NOT_FOUND';
  readonly kind = ErrorKind.NotFound;

  constructor() {
    super('Service not found.');
  }
}
