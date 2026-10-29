import { Clock } from '../../../../../shared/application/ports/clock.port';
import { DomainEventPublisher } from '../../../../../shared/application/ports/domain-event-publisher.port';
import { IdGenerator } from '../../../../../shared/application/ports/id-generator.port';
import { InventoryItemNotFoundError } from '../../../domain/errors/inventory-item-not-found.error';
import { InventoryItemId } from '../../../domain/value-objects/inventory-item-id';
import { StockMovementId } from '../../../domain/value-objects/stock-movement-id';
import { InventoryItemRepository } from '../../ports/inventory-item.repository';
import { AdjustStockCommand } from './adjust-stock.command';

export class AdjustStockHandler {
  constructor(
    private readonly items: InventoryItemRepository,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(command: AdjustStockCommand): Promise<void> {
    const item = await this.items.findById(InventoryItemId.create(command.itemId));
    if (!item) {
      throw new InventoryItemNotFoundError();
    }

    // The aggregate owns the arithmetic, the note rule and the never-negative invariant - this
    // handler computes nothing, so a future caller cannot bypass any of them by calling it
    // differently.
    item.adjustDown({
      quantity: command.quantity,
      actorUserId: command.actorUserId,
      note: command.note,
      movementId: StockMovementId.create(this.idGenerator.generate()),
      now: this.clock.now(),
    });
    await this.items.save(item);
    this.events.publish(item.pullDomainEvents());
  }
}
