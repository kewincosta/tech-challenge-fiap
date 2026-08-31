import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class InvalidLicensePlateError extends DomainError {
  readonly code = 'VEHICLE_INVALID_LICENSE_PLATE';
  readonly kind = ErrorKind.Validation;

  constructor() {
    super('Invalid license plate.');
  }
}
