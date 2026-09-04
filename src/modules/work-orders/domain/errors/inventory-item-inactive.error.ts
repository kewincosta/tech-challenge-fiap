import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class InventoryItemInactiveError extends DomainError {
  readonly code = 'WORK_ORDER_INVENTORY_ITEM_INACTIVE';
  readonly kind = ErrorKind.RuleViolation;

  constructor() {
    super('This inventory item is deactivated.');
  }
}
