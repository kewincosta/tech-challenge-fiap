import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class InvalidStockQuantityError extends DomainError {
  readonly code = 'INVENTORY_INVALID_STOCK_QUANTITY';
  readonly kind = ErrorKind.Validation;

  constructor() {
    super('Quantity on hand must be a non-negative whole number.');
  }
}
