import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class InvalidMovementQuantityError extends DomainError {
  readonly code = 'INVENTORY_INVALID_MOVEMENT_QUANTITY';
  readonly kind = ErrorKind.Validation;

  constructor() {
    super('Movement quantity must be a positive whole number.');
  }
}
