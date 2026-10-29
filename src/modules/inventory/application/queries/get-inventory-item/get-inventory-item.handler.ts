import { InventoryItemNotFoundError } from '../../../domain/errors/inventory-item-not-found.error';
import { InventoryItemId } from '../../../domain/value-objects/inventory-item-id';
import { InventoryItemSummaryDto, InventoryQueryPort } from '../../ports/inventory-query.port';
import { GetInventoryItemQuery } from './get-inventory-item.query';

/**
 * Returns the item whatever its status, so that "does not exist" (the not-found error) stays
 * apart from "exists but deactivated" (status), which planning a part on a work order refuses
 * precisely.
 */
export class GetInventoryItemHandler {
  constructor(private readonly inventoryQuery: InventoryQueryPort) {}

  async execute(query: GetInventoryItemQuery): Promise<InventoryItemSummaryDto> {
    try {
      InventoryItemId.create(query.itemId);
    } catch {
      // A malformed id matches nothing by construction, and a uuid column would throw on it.
      // The services and customers lookups use the same guard.
      throw new InventoryItemNotFoundError();
    }
    const item = await this.inventoryQuery.getById(query.itemId);
    if (!item) {
      throw new InventoryItemNotFoundError();
    }
    return item;
  }
}
