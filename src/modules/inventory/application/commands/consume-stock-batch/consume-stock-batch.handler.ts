import { Inject } from '@nestjs/common';
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs';
import { CLOCK, Clock } from '../../../../../shared/application/ports/clock.port';
import {
  ID_GENERATOR,
  IdGenerator,
} from '../../../../../shared/application/ports/id-generator.port';
import { InventoryItemNotFoundError } from '../../../domain/errors/inventory-item-not-found.error';
import {
  INVENTORY_ITEM_REPOSITORY,
  InventoryItemRepository,
} from '../../../domain/repositories/inventory-item.repository';
import { InventoryItemId } from '../../../domain/value-objects/inventory-item-id';
import { StockMovementId } from '../../../domain/value-objects/stock-movement-id';
import { ConsumedLineDto, ConsumeStockBatchCommand } from './consume-stock-batch.command';

/**
 * The inventory side of the write that spans two modules and two aggregates. Reached only from
 * inside `WithdrawPartsHandler`'s `transactionRunner.run` (AD-008) - `findAllByIdsForUpdate`
 * refuses to run with no open transaction, which is this handler's own guarantee that it never
 * commits on its own.
 */
@CommandHandler(ConsumeStockBatchCommand)
export class ConsumeStockBatchHandler implements ICommandHandler<
  ConsumeStockBatchCommand,
  ConsumedLineDto[]
> {
  constructor(
    @Inject(INVENTORY_ITEM_REPOSITORY) private readonly items: InventoryItemRepository,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: ConsumeStockBatchCommand): Promise<ConsumedLineDto[]> {
    const ids = command.lines.map((line) => InventoryItemId.create(line.inventoryItemId));
    const loaded = await this.items.findAllByIdsForUpdate(ids);
    const now = this.clock.now();

    // Every line applied to the in-memory aggregates first - a line that throws leaves every
    // earlier line's `save()` call never reached, so nothing this command touched persists.
    const results: ConsumedLineDto[] = [];
    for (const line of command.lines) {
      const item = loaded.find((candidate) => candidate.id.value === line.inventoryItemId);
      if (!item) {
        throw new InventoryItemNotFoundError();
      }
      const movementId = StockMovementId.create(this.idGenerator.generate());
      item.consume({
        quantity: line.quantity,
        workOrderId: command.workOrderId,
        actorUserId: command.actorUserId,
        movementId,
        now,
      });
      results.push({ inventoryItemId: item.id.value, movementId: movementId.value });
    }

    for (const item of loaded) {
      await this.items.save(item);
      this.eventBus.publishAll(item.pullDomainEvents());
    }
    return results;
  }
}
