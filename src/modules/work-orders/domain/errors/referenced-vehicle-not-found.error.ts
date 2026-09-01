import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class ReferencedVehicleNotFoundError extends DomainError {
  readonly code = 'WORK_ORDER_REFERENCED_VEHICLE_NOT_FOUND';
  readonly kind = ErrorKind.NotFound;

  constructor() {
    super('Vehicle not found.');
  }
}
