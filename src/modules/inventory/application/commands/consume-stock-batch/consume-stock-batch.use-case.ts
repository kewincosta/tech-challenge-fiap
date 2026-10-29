import { Clock } from '../../../../../shared/application/ports/clock.port';
import { DomainEventPublisher } from '../../../../../shared/application/ports/domain-event-publisher.port';
import { IdGenerator } from '../../../../../shared/application/ports/id-generator.port';
import { InventoryItemNotFoundError } from '../../../domain/errors/inventory-item-not-found.error';
import { InventoryItemId } from '../../../domain/value-objects/inventory-item-id';
import { StockMovementId } from '../../../domain/value-objects/stock-movement-id';
import { InventoryItemRepository } from '../../ports/inventory-item.repository';
import { ConsumedLineDto, ConsumeStockBatchCommand } from './consume-stock-batch.command';

/**
 * The inventory side of the write that spans two modules and two aggregates. Reached only from
 * inside `WithdrawPartsUseCase`'s `transactionRunner.run` (AD-008) - `findAllByIdsForUpdate`
 * refuses to run with no open transaction, which is this use case's own guarantee that it never
 * commits on its own.
 */
export class ConsumeStockBatchUseCase {
  constructor(
    private readonly items: InventoryItemRepository,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
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
      this.events.publish(item.pullDomainEvents());
    }
    return results;
  }
}
