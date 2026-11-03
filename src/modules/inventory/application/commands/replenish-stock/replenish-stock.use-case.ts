import { Clock } from '../../../../../shared/application/ports/clock.port';
import { DomainEventPublisher } from '../../../../../shared/application/ports/domain-event-publisher.port';
import { IdGenerator } from '../../../../../shared/application/ports/id-generator.port';
import { Money } from '../../../../../shared/domain/value-objects/money';
import { InventoryItemNotFoundError } from '../../../domain/errors/inventory-item-not-found.error';
import { InventoryItemId } from '../../../domain/value-objects/inventory-item-id';
import { StockMovementId } from '../../../domain/value-objects/stock-movement-id';
import { InventoryItemRepository } from '../../ports/inventory-item.repository';
import { ReplenishStockCommand } from './replenish-stock.command';

export class ReplenishStockUseCase {
  constructor(
    private readonly items: InventoryItemRepository,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(command: ReplenishStockCommand): Promise<void> {
    const item = await this.items.findById(InventoryItemId.create(command.itemId));
    if (!item) {
      throw new InventoryItemNotFoundError();
    }

    // The aggregate owns the arithmetic and the quantity rule (InvalidMovementQuantityError) - this
    // use case computes nothing, so a future caller cannot bypass either by calling it differently.
    item.replenish({
      quantity: command.quantity,
      unitPrice: Money.fromCents(command.unitPriceCents),
      actorUserId: command.actorUserId,
      note: command.note,
      movementId: StockMovementId.create(this.idGenerator.generate()),
      now: this.clock.now(),
    });
    await this.items.save(item);
    this.events.publish(item.pullDomainEvents());
  }
}
