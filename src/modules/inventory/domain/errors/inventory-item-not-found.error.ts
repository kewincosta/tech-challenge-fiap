import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class InventoryItemNotFoundError extends DomainError {
  readonly code = 'INVENTORY_ITEM_NOT_FOUND';
  readonly kind = ErrorKind.NotFound;

  constructor() {
    super('Inventory item not found.');
  }
}
