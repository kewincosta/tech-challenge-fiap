import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InventoryItemId } from '../../../domain/value-objects/inventory-item-id';
import {
  INVENTORY_QUERY_PORT,
  InventoryItemSummaryDto,
  InventoryQueryPort,
} from '../../ports/inventory-query.port';
import { GetInventoryItemQuery } from './get-inventory-item.query';

@QueryHandler(GetInventoryItemQuery)
export class GetInventoryItemHandler implements IQueryHandler<
  GetInventoryItemQuery,
  InventoryItemSummaryDto | null
> {
  constructor(@Inject(INVENTORY_QUERY_PORT) private readonly inventoryQuery: InventoryQueryPort) {}

  async execute(query: GetInventoryItemQuery): Promise<InventoryItemSummaryDto | null> {
    try {
      InventoryItemId.create(query.itemId);
    } catch {
      // A malformed id matches nothing by construction, and a uuid column would throw on it -
      // same guard GetServiceHandler/GetCustomerHandler use.
      return null;
    }
    return this.inventoryQuery.getById(query.itemId);
  }
}
