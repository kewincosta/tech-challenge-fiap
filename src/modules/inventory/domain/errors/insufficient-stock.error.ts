import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class InsufficientStockError extends DomainError {
  readonly code = 'INVENTORY_INSUFFICIENT_STOCK';
  readonly kind = ErrorKind.RuleViolation;

  constructor() {
    super('The quantity on hand cannot go below zero.');
  }
}
