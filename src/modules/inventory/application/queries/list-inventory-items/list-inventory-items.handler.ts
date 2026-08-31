import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  INVENTORY_QUERY_PORT,
  InventoryItemSummaryDto,
  InventoryQueryPort,
} from '../../ports/inventory-query.port';
import { ListInventoryItemsQuery } from './list-inventory-items.query';

@QueryHandler(ListInventoryItemsQuery)
export class ListInventoryItemsHandler implements IQueryHandler<
  ListInventoryItemsQuery,
  InventoryItemSummaryDto[]
> {
  constructor(@Inject(INVENTORY_QUERY_PORT) private readonly inventoryQuery: InventoryQueryPort) {}

  async execute(query: ListInventoryItemsQuery): Promise<InventoryItemSummaryDto[]> {
    return this.inventoryQuery.listActive(query.kind);
  }
}
