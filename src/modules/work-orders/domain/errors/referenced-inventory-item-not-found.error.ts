import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class ReferencedInventoryItemNotFoundError extends DomainError {
  readonly code = 'WORK_ORDER_REFERENCED_INVENTORY_ITEM_NOT_FOUND';
  readonly kind = ErrorKind.NotFound;

  constructor() {
    super('Inventory item not found.');
  }
}
