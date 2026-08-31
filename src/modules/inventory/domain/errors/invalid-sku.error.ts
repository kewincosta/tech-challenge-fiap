import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class InvalidSkuError extends DomainError {
  readonly code = 'INVENTORY_INVALID_SKU';
  readonly kind = ErrorKind.Validation;

  constructor() {
    super('SKU must be between 1 and 40 characters.');
  }
}
