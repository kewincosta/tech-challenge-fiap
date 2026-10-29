import { InventoryQueryPort, StockShortageDto } from '../../ports/inventory-query.port';
import { ListStockShortagesQuery } from './list-stock-shortages.query';

export class ListStockShortagesHandler {
  constructor(private readonly inventoryQuery: InventoryQueryPort) {}

  async execute(_query: ListStockShortagesQuery): Promise<StockShortageDto[]> {
    return this.inventoryQuery.listStockShortages();
  }
}
