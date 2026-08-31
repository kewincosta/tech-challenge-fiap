import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class VehicleNotFoundError extends DomainError {
  readonly code = 'VEHICLE_NOT_FOUND';
  readonly kind = ErrorKind.NotFound;

  constructor() {
    super('Vehicle not found.');
  }
}
