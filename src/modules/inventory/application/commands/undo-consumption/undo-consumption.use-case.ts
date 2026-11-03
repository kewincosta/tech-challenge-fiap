import { Clock } from '../../../../../shared/application/ports/clock.port';
import { DomainEventPublisher } from '../../../../../shared/application/ports/domain-event-publisher.port';
import { IdGenerator } from '../../../../../shared/application/ports/id-generator.port';
import { TransactionRunner } from '../../../../../shared/application/ports/transaction-runner.port';
import { InventoryItemNotFoundError } from '../../../domain/errors/inventory-item-not-found.error';
import { InventoryItemId } from '../../../domain/value-objects/inventory-item-id';
import { StockMovementId } from '../../../domain/value-objects/stock-movement-id';
import { InventoryItemRepository } from '../../ports/inventory-item.repository';
import { UndoConsumptionCommand } from './undo-consumption.command';

/**
 * The compensation of a withdrawal: gives back what the operation's consumptions still hold. Each
 * consumption gets one `RETURN` for its net remaining units, linked to the work order and tagged
 * with the same operation id, and the consumption keeps its row, so the movement history shows what
 * happened. A repeat finds nothing left and changes nothing, as does an operation that consumed
 * nothing. A consumption that a cancellation wrote off or a delivery settled while the withdrawal
 * was in flight comes back too, because the withdrawal never reached the work order. It opens a
 * transaction of its own, locks the items inside it and commits every return together.
 */
export class UndoConsumptionUseCase {
  constructor(
    private readonly items: InventoryItemRepository,
    private readonly transactionRunner: TransactionRunner,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(command: UndoConsumptionCommand): Promise<void> {
    // The first read takes no lock and only names the items to lock, so a repeat costs one query
    // and opens no transaction.
    const named = await this.items.findPendingConsumptionsOfOperation(command.operationId);
    if (named.length === 0) {
      return;
    }
    const ids = [...new Set(named.map((consumption) => consumption.inventoryItemId))].map((id) =>
      InventoryItemId.create(id),
    );
    await this.transactionRunner.run(async () => {
      const loaded = await this.items.findAllByIdsForUpdate(ids);
      // Read again under the lock: a concurrent undo of the same operation may have returned these
      // units between the first read and the lock.
      const pending = await this.items.findPendingConsumptionsOfOperation(command.operationId);
      const now = this.clock.now();

      for (const consumption of pending) {
        const item = loaded.find((candidate) => candidate.id.value === consumption.inventoryItemId);
        if (!item) {
          throw new InventoryItemNotFoundError();
        }
        item.restoreUnits({
          quantity: consumption.quantity,
          workOrderId: consumption.workOrderId,
          actorUserId: command.actorUserId,
          movementId: StockMovementId.create(this.idGenerator.generate()),
          undoesMovementId: consumption.movementId,
          operationId: command.operationId,
          now,
        });
      }

      for (const item of loaded) {
        await this.items.save(item);
        this.events.publish(item.pullDomainEvents());
      }
    });
  }
}
