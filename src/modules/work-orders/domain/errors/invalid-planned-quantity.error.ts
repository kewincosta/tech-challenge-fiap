import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class InvalidPlannedQuantityError extends DomainError {
  readonly code = 'WORK_ORDER_INVALID_PLANNED_QUANTITY';
  readonly kind = ErrorKind.Validation;

  constructor() {
    super('Planned quantity must be a positive whole number.');
  }
}
