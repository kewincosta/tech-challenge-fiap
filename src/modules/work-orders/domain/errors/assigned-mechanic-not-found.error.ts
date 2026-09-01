import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class AssignedMechanicNotFoundError extends DomainError {
  readonly code = 'WORK_ORDER_ASSIGNED_MECHANIC_NOT_FOUND';
  readonly kind = ErrorKind.NotFound;

  constructor() {
    super('User not found.');
  }
}
