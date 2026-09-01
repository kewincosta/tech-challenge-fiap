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
import { RestoreStockBatchCommand } from './restore-stock-batch.command';

/**
 * The inventory side of a return. Same shape as `ConsumeStockBatchHandler`: reached only from
 * inside `ReturnPartsHandler`'s `transactionRunner.run` (AD-008), validates every line before
 * saving any of them.
 */
@CommandHandler(RestoreStockBatchCommand)
export class RestoreStockBatchHandler implements ICommandHandler<RestoreStockBatchCommand, void> {
  constructor(
    @Inject(INVENTORY_ITEM_REPOSITORY) private readonly items: InventoryItemRepository,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: RestoreStockBatchCommand): Promise<void> {
    const ids = command.lines.map((line) => InventoryItemId.create(line.inventoryItemId));
    const loaded = await this.items.findAllByIdsForUpdate(ids);
    const now = this.clock.now();

    for (const line of command.lines) {
      const item = loaded.find((candidate) => candidate.id.value === line.inventoryItemId);
      if (!item) {
        throw new InventoryItemNotFoundError();
      }
      // Never edits `line.undoesMovementId`'s own row - it only appends a new RETURN pointing
      // at it (rule 22, H32).
      item.restoreUnits({
        quantity: line.quantity,
        workOrderId: command.workOrderId,
        actorUserId: command.actorUserId,
        movementId: StockMovementId.create(this.idGenerator.generate()),
        undoesMovementId: line.undoesMovementId,
        now,
      });
    }

    for (const item of loaded) {
      await this.items.save(item);
      this.eventBus.publishAll(item.pullDomainEvents());
    }
  }
}
