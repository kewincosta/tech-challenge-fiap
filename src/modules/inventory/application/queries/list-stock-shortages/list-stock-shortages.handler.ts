import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  INVENTORY_QUERY_PORT,
  InventoryQueryPort,
  StockShortageDto,
} from '../../ports/inventory-query.port';
import { ListStockShortagesQuery } from './list-stock-shortages.query';

@QueryHandler(ListStockShortagesQuery)
export class ListStockShortagesHandler
  implements IQueryHandler<ListStockShortagesQuery, StockShortageDto[]>
{
  constructor(@Inject(INVENTORY_QUERY_PORT) private readonly inventoryQuery: InventoryQueryPort) {}

  async execute(): Promise<StockShortageDto[]> {
    return this.inventoryQuery.listStockShortages();
  }
}
