import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class InvalidVehicleYearError extends DomainError {
  readonly code = 'VEHICLE_INVALID_YEAR';
  readonly kind = ErrorKind.Validation;

  constructor() {
    super('Invalid vehicle year.');
  }
}
