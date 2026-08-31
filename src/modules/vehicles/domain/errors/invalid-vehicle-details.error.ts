import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class InvalidVehicleDetailsError extends DomainError {
  readonly code = 'VEHICLE_INVALID_DETAILS';
  readonly kind = ErrorKind.Validation;

  constructor() {
    super('Brand and model must not be empty.');
  }
}
