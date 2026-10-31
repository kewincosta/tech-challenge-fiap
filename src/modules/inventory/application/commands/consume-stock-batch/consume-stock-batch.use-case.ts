import { Clock } from '../../../../../shared/application/ports/clock.port';
import { DomainEventPublisher } from '../../../../../shared/application/ports/domain-event-publisher.port';
import { IdGenerator } from '../../../../../shared/application/ports/id-generator.port';
import { TransactionRunner } from '../../../../../shared/application/ports/transaction-runner.port';
import { InventoryItemNotFoundError } from '../../../domain/errors/inventory-item-not-found.error';
import { InventoryItemId } from '../../../domain/value-objects/inventory-item-id';
import { StockMovementId } from '../../../domain/value-objects/stock-movement-id';
import { InventoryItemRepository } from '../../ports/inventory-item.repository';
import { ConsumedLineDto, ConsumeStockBatchCommand } from './consume-stock-batch.command';

/**
 * The inventory side of a withdrawal. It opens a transaction of its own, locks every item of the
 * batch inside it and commits the whole batch together, so the work order's module never holds a
 * transaction that writes stock. The movements carry the caller's operation id, which is how
 * `UndoConsumptionUseCase` finds them again if the withdrawal has to be undone.
 */
export class ConsumeStockBatchUseCase {
  constructor(
    private readonly items: InventoryItemRepository,
    private readonly transactionRunner: TransactionRunner,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
  ) {}

  execute(command: ConsumeStockBatchCommand): Promise<ConsumedLineDto[]> {
    return this.transactionRunner.run(async () => {
      const ids = command.lines.map((line) => InventoryItemId.create(line.inventoryItemId));
      const loaded = await this.items.findAllByIdsForUpdate(ids);
      const now = this.clock.now();

      // Every line is applied to the in-memory aggregates first. A line that throws leaves the
      // `save()` call of every earlier line unreached, so nothing this command touched persists.
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
          operationId: command.operationId,
          now,
        });
        results.push({ inventoryItemId: item.id.value, movementId: movementId.value });
      }

      for (const item of loaded) {
        await this.items.save(item);
        this.events.publish(item.pullDomainEvents());
      }
      return results;
    });
  }
}
