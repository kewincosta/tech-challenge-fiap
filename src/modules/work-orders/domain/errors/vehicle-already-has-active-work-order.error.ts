import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class VehicleAlreadyHasActiveWorkOrderError extends DomainError {
  readonly code = 'WORK_ORDER_VEHICLE_ALREADY_HAS_ACTIVE_WORK_ORDER';
  readonly kind = ErrorKind.Conflict;

  constructor() {
    super('This vehicle already has a work order that is not finished.');
  }
}
