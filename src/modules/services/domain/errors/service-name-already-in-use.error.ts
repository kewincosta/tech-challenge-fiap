import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class ServiceNameAlreadyInUseError extends DomainError {
  readonly code = 'SERVICE_NAME_ALREADY_IN_USE';
  readonly kind = ErrorKind.Conflict;

  constructor() {
    super('Another active service already uses this name.');
  }
}
