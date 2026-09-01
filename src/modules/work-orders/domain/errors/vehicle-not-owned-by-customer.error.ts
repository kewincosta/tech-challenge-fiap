import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class VehicleNotOwnedByCustomerError extends DomainError {
  readonly code = 'WORK_ORDER_VEHICLE_NOT_OWNED_BY_CUSTOMER';
  readonly kind = ErrorKind.RuleViolation;

  constructor() {
    super('This vehicle does not belong to the given customer.');
  }
}
