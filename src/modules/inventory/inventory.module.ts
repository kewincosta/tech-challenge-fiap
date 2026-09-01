import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdjustStockHandler } from './application/commands/adjust-stock/adjust-stock.handler';
import { ConsumeStockBatchHandler } from './application/commands/consume-stock-batch/consume-stock-batch.handler';
import { CreateInventoryItemHandler } from './application/commands/create-inventory-item/create-inventory-item.handler';
import { ReplenishStockHandler } from './application/commands/replenish-stock/replenish-stock.handler';
import { RestoreStockBatchHandler } from './application/commands/restore-stock-batch/restore-stock-batch.handler';
import { UpdateInventoryItemHandler } from './application/commands/update-inventory-item/update-inventory-item.handler';
import { INVENTORY_QUERY_PORT } from './application/ports/inventory-query.port';
import { GetInventoryItemHandler } from './application/queries/get-inventory-item/get-inventory-item.handler';
import { GetItemMovementHistoryHandler } from './application/queries/get-item-movement-history/get-item-movement-history.handler';
import { ListInventoryItemsHandler } from './application/queries/list-inventory-items/list-inventory-items.handler';
import { ListStockShortagesHandler } from './application/queries/list-stock-shortages/list-stock-shortages.handler';
import { INVENTORY_ITEM_REPOSITORY } from './domain/repositories/inventory-item.repository';
import { InventoryItemOrmEntity } from './infrastructure/persistence/inventory-item.orm-entity';
import { StockMovementOrmEntity } from './infrastructure/persistence/stock-movement.orm-entity';
import { TypeOrmInventoryItemRepository } from './infrastructure/persistence/typeorm-inventory-item.repository';
import { TypeOrmInventoryQueryAdapter } from './infrastructure/persistence/typeorm-inventory-query.adapter';
import { InventoryItemsController } from './presentation/controllers/inventory-items.controller';

@Module({
  imports: [TypeOrmModule.forFeature([InventoryItemOrmEntity, StockMovementOrmEntity])],
  controllers: [InventoryItemsController],
  providers: [
    CreateInventoryItemHandler,
    UpdateInventoryItemHandler,
    ReplenishStockHandler,
    AdjustStockHandler,
    GetInventoryItemHandler,
    ListInventoryItemsHandler,
    GetItemMovementHistoryHandler,
    ListStockShortagesHandler,
    ConsumeStockBatchHandler,
    RestoreStockBatchHandler,
    { provide: INVENTORY_ITEM_REPOSITORY, useClass: TypeOrmInventoryItemRepository },
    { provide: INVENTORY_QUERY_PORT, useClass: TypeOrmInventoryQueryAdapter },
  ],
})
export class InventoryModule {}
