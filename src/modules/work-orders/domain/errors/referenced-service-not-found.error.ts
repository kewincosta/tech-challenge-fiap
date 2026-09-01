import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class ReferencedServiceNotFoundError extends DomainError {
  readonly code = 'WORK_ORDER_REFERENCED_SERVICE_NOT_FOUND';
  readonly kind = ErrorKind.NotFound;

  constructor() {
    super('Service not found.');
  }
}
