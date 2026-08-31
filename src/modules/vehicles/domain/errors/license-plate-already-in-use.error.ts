import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class LicensePlateAlreadyInUseError extends DomainError {
  readonly code = 'VEHICLE_LICENSE_PLATE_ALREADY_IN_USE';
  readonly kind = ErrorKind.Conflict;

  constructor() {
    super('This plate already belongs to another active vehicle.');
  }
}
