import { Clock } from '../../../../../shared/application/ports/clock.port';
import { DomainEventPublisher } from '../../../../../shared/application/ports/domain-event-publisher.port';
import { IdGenerator } from '../../../../../shared/application/ports/id-generator.port';
import { TransactionRunner } from '../../../../../shared/application/ports/transaction-runner.port';
import { InventoryItemNotFoundError } from '../../../domain/errors/inventory-item-not-found.error';
import { InventoryItemId } from '../../../domain/value-objects/inventory-item-id';
import { StockMovementId } from '../../../domain/value-objects/stock-movement-id';
import { InventoryItemRepository } from '../../ports/inventory-item.repository';
import { RestoreStockBatchCommand } from './restore-stock-batch.command';

/**
 * The inventory side of a return. It opens a transaction of its own, locks every item of the batch
 * inside it, validates every line before saving any of them and commits the whole batch together.
 * A repeat of an operation that was applied changes nothing.
 *
 * Work-orders has no way to know which movement a return undoes - that data lives only in this
 * module's own `stock_movements` ledger, so this use case resolves it itself: for each line, it
 * draws from the item's pending consumptions on that work order, newest first, splitting the
 * requested quantity across as many as it takes and appending one `RETURN` per consumption drawn
 * from (spec.md's Assumptions). Only confirmed consumptions are drawn from, so the units of a
 * withdrawal still in flight are left to its undo.
 */
export class RestoreStockBatchUseCase {
  constructor(
    private readonly items: InventoryItemRepository,
    private readonly transactionRunner: TransactionRunner,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
  ) {}

  execute(command: RestoreStockBatchCommand): Promise<void> {
    return this.transactionRunner.run(async () => {
      const ids = command.lines.map((line) => InventoryItemId.create(line.inventoryItemId));
      const loaded = await this.items.findAllByIdsForUpdate(ids);
      // A repeat of a restore that was applied changes nothing. The check follows the lock, so a
      // concurrent run of the same operation has committed by the time it is made.
      if (await this.items.hasReturnOfOperation(command.operationId)) {
        return;
      }
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
            operationId: command.operationId,
            now,
          });
          remaining -= draw;
        }
        if (remaining > 0) {
          // The work-orders aggregate already guards against returning more than was withdrawn
          // (`WithdrawalExceedsPlannedError`'s sibling on the return side). Reaching here means the
          // two ledgers disagree, which is a bug in the code and no rule a user can break.
          throw new Error(
            `No pending consumption covers a return of ${line.quantity} on item ${line.inventoryItemId} for work order ${command.workOrderId}`,
          );
        }
      }

      for (const item of loaded) {
        await this.items.save(item);
        this.events.publish(item.pullDomainEvents());
      }
    });
  }
}
