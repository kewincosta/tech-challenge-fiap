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
 *
 * Work-orders has no way to know which movement a return undoes - that data lives only in this
 * module's own `stock_movements` ledger, so this handler resolves it itself: for each line, it
 * draws from the item's pending consumptions on that work order, newest first, splitting the
 * requested quantity across as many as it takes and appending one `RETURN` per consumption drawn
 * from (spec.md's Assumptions).
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
      const pending = await this.items.findPendingConsumptions(item.id, command.workOrderId);
      let remaining = line.quantity;
      for (const consumption of pending) {
        if (remaining <= 0) {
          break;
        }
        const draw = Math.min(remaining, consumption.quantity);
        item.restoreUnits({
          quantity: draw,
          workOrderId: command.workOrderId,
          actorUserId: command.actorUserId,
          movementId: StockMovementId.create(this.idGenerator.generate()),
          undoesMovementId: consumption.movementId,
          now,
        });
        remaining -= draw;
      }
      if (remaining > 0) {
        // The work-orders aggregate already guards against returning more than was withdrawn
        // (`WithdrawalExceedsPlannedError`'s sibling on the return side) - reaching here means the
        // two ledgers disagree, which is a bug, not a user-facing rule violation.
        throw new Error(
          `No pending consumption covers a return of ${line.quantity} on item ${line.inventoryItemId} for work order ${command.workOrderId}`,
        );
      }
    }

    for (const item of loaded) {
      await this.items.save(item);
      this.eventBus.publishAll(item.pullDomainEvents());
    }
  }
}
