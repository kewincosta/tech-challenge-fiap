import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Clock } from '../../shared/application/ports/clock.port';
import { DomainEventPublisher } from '../../shared/application/ports/domain-event-publisher.port';
import { IdGenerator } from '../../shared/application/ports/id-generator.port';
import { TransactionRunner } from '../../shared/application/ports/transaction-runner.port';
import {
  CLOCK,
  DOMAIN_EVENT_PUBLISHER,
  ID_GENERATOR,
  TRANSACTION_RUNNER,
} from '../../shared/shared.tokens';
import { IdentityModule } from '../identity';
import { AdjustStockUseCase } from './application/commands/adjust-stock/adjust-stock.use-case';
import { ConsumeStockBatchUseCase } from './application/commands/consume-stock-batch/consume-stock-batch.use-case';
import { CreateInventoryItemUseCase } from './application/commands/create-inventory-item/create-inventory-item.use-case';
import { DeactivateInventoryItemUseCase } from './application/commands/deactivate-inventory-item/deactivate-inventory-item.use-case';
import { ReplenishStockUseCase } from './application/commands/replenish-stock/replenish-stock.use-case';
import { RestoreStockBatchUseCase } from './application/commands/restore-stock-batch/restore-stock-batch.use-case';
import { SettleStockMovementsUseCase } from './application/commands/settle-stock-movements/settle-stock-movements.use-case';
import { UndoConsumptionUseCase } from './application/commands/undo-consumption/undo-consumption.use-case';
import { UpdateInventoryItemUseCase } from './application/commands/update-inventory-item/update-inventory-item.use-case';
import { WriteOffStockMovementsUseCase } from './application/commands/write-off-stock-movements/write-off-stock-movements.use-case';
import { InventoryItemRepository } from './application/ports/inventory-item.repository';
import { InventoryQueryPort } from './application/ports/inventory-query.port';
import { GetInventoryItemUseCase } from './application/queries/get-inventory-item/get-inventory-item.use-case';
import { GetItemMovementHistoryUseCase } from './application/queries/get-item-movement-history/get-item-movement-history.use-case';
import { ListInventoryItemsUseCase } from './application/queries/list-inventory-items/list-inventory-items.use-case';
import { ListStockShortagesUseCase } from './application/queries/list-stock-shortages/list-stock-shortages.use-case';
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
      provide: CreateInventoryItemUseCase,
      useFactory: (
        items: InventoryItemRepository,
        idGenerator: IdGenerator,
        clock: Clock,
        events: DomainEventPublisher,
      ) => new CreateInventoryItemUseCase(items, idGenerator, clock, events),
      inject: [INVENTORY_ITEM_REPOSITORY, ID_GENERATOR, CLOCK, DOMAIN_EVENT_PUBLISHER],
    },
    {
      provide: UpdateInventoryItemUseCase,
      useFactory: (items: InventoryItemRepository, clock: Clock, events: DomainEventPublisher) =>
        new UpdateInventoryItemUseCase(items, clock, events),
      inject: [INVENTORY_ITEM_REPOSITORY, CLOCK, DOMAIN_EVENT_PUBLISHER],
    },
    {
      provide: DeactivateInventoryItemUseCase,
      useFactory: (
        items: InventoryItemRepository,
        inventoryQuery: InventoryQueryPort,
        clock: Clock,
        events: DomainEventPublisher,
      ) => new DeactivateInventoryItemUseCase(items, inventoryQuery, clock, events),
      inject: [INVENTORY_ITEM_REPOSITORY, INVENTORY_QUERY_PORT, CLOCK, DOMAIN_EVENT_PUBLISHER],
    },
    {
      provide: GetInventoryItemUseCase,
      useFactory: (inventoryQuery: InventoryQueryPort) =>
        new GetInventoryItemUseCase(inventoryQuery),
      inject: [INVENTORY_QUERY_PORT],
    },
    {
      provide: ListInventoryItemsUseCase,
      useFactory: (inventoryQuery: InventoryQueryPort) =>
        new ListInventoryItemsUseCase(inventoryQuery),
      inject: [INVENTORY_QUERY_PORT],
    },
    {
      provide: GetItemMovementHistoryUseCase,
      useFactory: (inventoryQuery: InventoryQueryPort) =>
        new GetItemMovementHistoryUseCase(inventoryQuery),
      inject: [INVENTORY_QUERY_PORT],
    },
    {
      provide: ListStockShortagesUseCase,
      useFactory: (inventoryQuery: InventoryQueryPort) =>
        new ListStockShortagesUseCase(inventoryQuery),
      inject: [INVENTORY_QUERY_PORT],
    },
    {
      provide: ReplenishStockUseCase,
      useFactory: (
        items: InventoryItemRepository,
        idGenerator: IdGenerator,
        clock: Clock,
        events: DomainEventPublisher,
      ) => new ReplenishStockUseCase(items, idGenerator, clock, events),
      inject: [INVENTORY_ITEM_REPOSITORY, ID_GENERATOR, CLOCK, DOMAIN_EVENT_PUBLISHER],
    },
    {
      provide: AdjustStockUseCase,
      useFactory: (
        items: InventoryItemRepository,
        idGenerator: IdGenerator,
        clock: Clock,
        events: DomainEventPublisher,
      ) => new AdjustStockUseCase(items, idGenerator, clock, events),
      inject: [INVENTORY_ITEM_REPOSITORY, ID_GENERATOR, CLOCK, DOMAIN_EVENT_PUBLISHER],
    },
    {
      provide: ConsumeStockBatchUseCase,
      useFactory: (
        items: InventoryItemRepository,
        transactionRunner: TransactionRunner,
        idGenerator: IdGenerator,
        clock: Clock,
        events: DomainEventPublisher,
      ) => new ConsumeStockBatchUseCase(items, transactionRunner, idGenerator, clock, events),
      inject: [
        INVENTORY_ITEM_REPOSITORY,
        TRANSACTION_RUNNER,
        ID_GENERATOR,
        CLOCK,
        DOMAIN_EVENT_PUBLISHER,
      ],
    },
    {
      provide: RestoreStockBatchUseCase,
      useFactory: (
        items: InventoryItemRepository,
        transactionRunner: TransactionRunner,
        idGenerator: IdGenerator,
        clock: Clock,
        events: DomainEventPublisher,
      ) => new RestoreStockBatchUseCase(items, transactionRunner, idGenerator, clock, events),
      inject: [
        INVENTORY_ITEM_REPOSITORY,
        TRANSACTION_RUNNER,
        ID_GENERATOR,
        CLOCK,
        DOMAIN_EVENT_PUBLISHER,
      ],
    },
    {
      provide: UndoConsumptionUseCase,
      useFactory: (
        items: InventoryItemRepository,
        transactionRunner: TransactionRunner,
        idGenerator: IdGenerator,
        clock: Clock,
        events: DomainEventPublisher,
      ) => new UndoConsumptionUseCase(items, transactionRunner, idGenerator, clock, events),
      inject: [
        INVENTORY_ITEM_REPOSITORY,
        TRANSACTION_RUNNER,
        ID_GENERATOR,
        CLOCK,
        DOMAIN_EVENT_PUBLISHER,
      ],
    },
    {
      provide: SettleStockMovementsUseCase,
      useFactory: (
        items: InventoryItemRepository,
        transactionRunner: TransactionRunner,
        clock: Clock,
      ) => new SettleStockMovementsUseCase(items, transactionRunner, clock),
      inject: [INVENTORY_ITEM_REPOSITORY, TRANSACTION_RUNNER, CLOCK],
    },
    {
      provide: WriteOffStockMovementsUseCase,
      useFactory: (
        items: InventoryItemRepository,
        transactionRunner: TransactionRunner,
        clock: Clock,
      ) => new WriteOffStockMovementsUseCase(items, transactionRunner, clock),
      inject: [INVENTORY_ITEM_REPOSITORY, TRANSACTION_RUNNER, CLOCK],
    },
    { provide: INVENTORY_ITEM_REPOSITORY, useClass: TypeOrmInventoryItemRepository },
    { provide: INVENTORY_QUERY_PORT, useClass: TypeOrmInventoryQueryAdapter },
    InventoryItemKeyResolver,
  ],
  exports: [
    GetInventoryItemUseCase,
    ConsumeStockBatchUseCase,
    RestoreStockBatchUseCase,
    UndoConsumptionUseCase,
    SettleStockMovementsUseCase,
    WriteOffStockMovementsUseCase,
    InventoryItemKeyResolver,
  ],
})
export class InventoryModule {}
