import { Clock } from '../../../../../shared/application/ports/clock.port';
import { DomainEventPublisher } from '../../../../../shared/application/ports/domain-event-publisher.port';
import { IdGenerator } from '../../../../../shared/application/ports/id-generator.port';
import { InventoryItemNotFoundError } from '../../../domain/errors/inventory-item-not-found.error';
import { InventoryItemId } from '../../../domain/value-objects/inventory-item-id';
import { StockMovementId } from '../../../domain/value-objects/stock-movement-id';
import { InventoryItemRepository } from '../../ports/inventory-item.repository';
import { RestoreStockBatchCommand } from './restore-stock-batch.command';

/**
 * The inventory side of a return. Same shape as `ConsumeStockBatchUseCase`: reached only from
 * inside `ReturnPartsUseCase`'s `transactionRunner.run` (AD-008), validates every line before
 * saving any of them.
 *
 * Work-orders has no way to know which movement a return undoes - that data lives only in this
 * module's own `stock_movements` ledger, so this use case resolves it itself: for each line, it
 * draws from the item's pending consumptions on that work order, newest first, splitting the
 * requested quantity across as many as it takes and appending one `RETURN` per consumption drawn
 * from (spec.md's Assumptions).
 */
export class RestoreStockBatchUseCase {
  constructor(
    private readonly items: InventoryItemRepository,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
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
      this.events.publish(item.pullDomainEvents());
    }
  }
}
