import { InventoryItemNotFoundError } from '../../../domain/errors/inventory-item-not-found.error';
import { InventoryQueryPort, StockMovementSummaryDto } from '../../ports/inventory-query.port';
import { GetItemMovementHistoryQuery } from './get-item-movement-history.query';

/**
 * An unknown item is refused with the not-found error (INV-04 AC5). An item with no movements yet
 * answers an empty list, never an error (spec.md's Edge Cases).
 */
export class GetItemMovementHistoryUseCase {
  constructor(private readonly inventoryQuery: InventoryQueryPort) {}

  async execute(query: GetItemMovementHistoryQuery): Promise<StockMovementSummaryDto[]> {
    if (!(await this.inventoryQuery.getById(query.itemId))) {
      throw new InventoryItemNotFoundError();
    }
    return this.inventoryQuery.listMovements(query.itemId);
  }
}
