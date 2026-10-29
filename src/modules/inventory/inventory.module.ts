import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Clock } from '../../shared/application/ports/clock.port';
import { DomainEventPublisher } from '../../shared/application/ports/domain-event-publisher.port';
import { IdGenerator } from '../../shared/application/ports/id-generator.port';
import { CLOCK, DOMAIN_EVENT_PUBLISHER, ID_GENERATOR } from '../../shared/shared.tokens';
import { IdentityModule } from '../identity';
import { AdjustStockHandler } from './application/commands/adjust-stock/adjust-stock.handler';
import { ConsumeStockBatchHandler } from './application/commands/consume-stock-batch/consume-stock-batch.handler';
import { CreateInventoryItemHandler } from './application/commands/create-inventory-item/create-inventory-item.handler';
import { DeactivateInventoryItemHandler } from './application/commands/deactivate-inventory-item/deactivate-inventory-item.handler';
import { ReplenishStockHandler } from './application/commands/replenish-stock/replenish-stock.handler';
import { RestoreStockBatchHandler } from './application/commands/restore-stock-batch/restore-stock-batch.handler';
import { SettleStockMovementsHandler } from './application/commands/settle-stock-movements/settle-stock-movements.handler';
import { UpdateInventoryItemHandler } from './application/commands/update-inventory-item/update-inventory-item.handler';
import { WriteOffStockMovementsHandler } from './application/commands/write-off-stock-movements/write-off-stock-movements.handler';
import { InventoryItemRepository } from './application/ports/inventory-item.repository';
import { InventoryQueryPort } from './application/ports/inventory-query.port';
import { GetInventoryItemHandler } from './application/queries/get-inventory-item/get-inventory-item.handler';
import { GetItemMovementHistoryHandler } from './application/queries/get-item-movement-history/get-item-movement-history.handler';
import { ListInventoryItemsHandler } from './application/queries/list-inventory-items/list-inventory-items.handler';
import { ListStockShortagesHandler } from './application/queries/list-stock-shortages/list-stock-shortages.handler';
import { InventoryItemKeyResolver } from './infrastructure/persistence/inventory-item-key-resolver';
import { InventoryItemOrmEntity } from './infrastructure/persistence/inventory-item.orm-entity';
import { StockMovementOrmEntity } from './infrastructure/persistence/stock-movement.orm-entity';
import { TypeOrmInventoryItemRepository } from './infrastructure/persistence/typeorm-inventory-item.repository';
import { TypeOrmInventoryQueryAdapter } from './infrastructure/persistence/typeorm-inventory-query.adapter';
import { INVENTORY_ITEM_REPOSITORY, INVENTORY_QUERY_PORT } from './inventory.tokens';
import { InventoryItemsController } from './presentation/controllers/inventory-items.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([InventoryItemOrmEntity, StockMovementOrmEntity]),
    IdentityModule,
  ],
  controllers: [InventoryItemsController],
  providers: [
    {
      provide: CreateInventoryItemHandler,
      useFactory: (
        items: InventoryItemRepository,
        idGenerator: IdGenerator,
        clock: Clock,
        events: DomainEventPublisher,
      ) => new CreateInventoryItemHandler(items, idGenerator, clock, events),
      inject: [INVENTORY_ITEM_REPOSITORY, ID_GENERATOR, CLOCK, DOMAIN_EVENT_PUBLISHER],
    },
    {
      provide: UpdateInventoryItemHandler,
      useFactory: (items: InventoryItemRepository, clock: Clock, events: DomainEventPublisher) =>
        new UpdateInventoryItemHandler(items, clock, events),
      inject: [INVENTORY_ITEM_REPOSITORY, CLOCK, DOMAIN_EVENT_PUBLISHER],
    },
    {
      provide: DeactivateInventoryItemHandler,
      useFactory: (
        items: InventoryItemRepository,
        inventoryQuery: InventoryQueryPort,
        clock: Clock,
        events: DomainEventPublisher,
      ) => new DeactivateInventoryItemHandler(items, inventoryQuery, clock, events),
      inject: [INVENTORY_ITEM_REPOSITORY, INVENTORY_QUERY_PORT, CLOCK, DOMAIN_EVENT_PUBLISHER],
    },
    {
      provide: GetInventoryItemHandler,
      useFactory: (inventoryQuery: InventoryQueryPort) =>
        new GetInventoryItemHandler(inventoryQuery),
      inject: [INVENTORY_QUERY_PORT],
    },
    {
      provide: ListInventoryItemsHandler,
      useFactory: (inventoryQuery: InventoryQueryPort) =>
        new ListInventoryItemsHandler(inventoryQuery),
      inject: [INVENTORY_QUERY_PORT],
    },
    {
      provide: GetItemMovementHistoryHandler,
      useFactory: (inventoryQuery: InventoryQueryPort) =>
        new GetItemMovementHistoryHandler(inventoryQuery),
      inject: [INVENTORY_QUERY_PORT],
    },
    {
      provide: ListStockShortagesHandler,
      useFactory: (inventoryQuery: InventoryQueryPort) =>
        new ListStockShortagesHandler(inventoryQuery),
      inject: [INVENTORY_QUERY_PORT],
    },
    {
      provide: ReplenishStockHandler,
      useFactory: (
        items: InventoryItemRepository,
        idGenerator: IdGenerator,
        clock: Clock,
        events: DomainEventPublisher,
      ) => new ReplenishStockHandler(items, idGenerator, clock, events),
      inject: [INVENTORY_ITEM_REPOSITORY, ID_GENERATOR, CLOCK, DOMAIN_EVENT_PUBLISHER],
    },
    {
      provide: AdjustStockHandler,
      useFactory: (
        items: InventoryItemRepository,
        idGenerator: IdGenerator,
        clock: Clock,
        events: DomainEventPublisher,
      ) => new AdjustStockHandler(items, idGenerator, clock, events),
      inject: [INVENTORY_ITEM_REPOSITORY, ID_GENERATOR, CLOCK, DOMAIN_EVENT_PUBLISHER],
    },
    {
      provide: ConsumeStockBatchHandler,
      useFactory: (
        items: InventoryItemRepository,
        idGenerator: IdGenerator,
        clock: Clock,
        events: DomainEventPublisher,
      ) => new ConsumeStockBatchHandler(items, idGenerator, clock, events),
      inject: [INVENTORY_ITEM_REPOSITORY, ID_GENERATOR, CLOCK, DOMAIN_EVENT_PUBLISHER],
    },
    {
      provide: RestoreStockBatchHandler,
      useFactory: (
        items: InventoryItemRepository,
        idGenerator: IdGenerator,
        clock: Clock,
        events: DomainEventPublisher,
      ) => new RestoreStockBatchHandler(items, idGenerator, clock, events),
      inject: [INVENTORY_ITEM_REPOSITORY, ID_GENERATOR, CLOCK, DOMAIN_EVENT_PUBLISHER],
    },
    {
      provide: SettleStockMovementsHandler,
      useFactory: (items: InventoryItemRepository, clock: Clock) =>
        new SettleStockMovementsHandler(items, clock),
      inject: [INVENTORY_ITEM_REPOSITORY, CLOCK],
    },
    {
      provide: WriteOffStockMovementsHandler,
      useFactory: (items: InventoryItemRepository, clock: Clock) =>
        new WriteOffStockMovementsHandler(items, clock),
      inject: [INVENTORY_ITEM_REPOSITORY, CLOCK],
    },
    { provide: INVENTORY_ITEM_REPOSITORY, useClass: TypeOrmInventoryItemRepository },
    { provide: INVENTORY_QUERY_PORT, useClass: TypeOrmInventoryQueryAdapter },
    InventoryItemKeyResolver,
  ],
  exports: [
    GetInventoryItemHandler,
    ConsumeStockBatchHandler,
    RestoreStockBatchHandler,
    SettleStockMovementsHandler,
    WriteOffStockMovementsHandler,
    InventoryItemKeyResolver,
  ],
})
export class InventoryModule {}
