import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  INVENTORY_QUERY_PORT,
  InventoryQueryPort,
  StockMovementSummaryDto,
} from '../../ports/inventory-query.port';
import { GetItemMovementHistoryQuery } from './get-item-movement-history.query';

/**
 * Whether the item itself exists is not this handler's concern - the 404 for an unknown item
 * (INV-04 AC5) is checked at the controller, alongside `GetInventoryItemQuery`. An item with no
 * movements yet answers an empty list here, never an error (spec.md's Edge Cases).
 */
@QueryHandler(GetItemMovementHistoryQuery)
export class GetItemMovementHistoryHandler implements IQueryHandler<
  GetItemMovementHistoryQuery,
  StockMovementSummaryDto[]
> {
  constructor(@Inject(INVENTORY_QUERY_PORT) private readonly inventoryQuery: InventoryQueryPort) {}

  async execute(query: GetItemMovementHistoryQuery): Promise<StockMovementSummaryDto[]> {
    return this.inventoryQuery.listMovements(query.itemId);
  }
}
