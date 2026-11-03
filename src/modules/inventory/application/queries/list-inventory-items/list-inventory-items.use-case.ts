import { InventoryItemSummaryDto, InventoryQueryPort } from '../../ports/inventory-query.port';
import { ListInventoryItemsQuery } from './list-inventory-items.query';

export class ListInventoryItemsUseCase {
  constructor(private readonly inventoryQuery: InventoryQueryPort) {}

  async execute(query: ListInventoryItemsQuery): Promise<InventoryItemSummaryDto[]> {
    return this.inventoryQuery.listActive(query.kind);
  }
}
