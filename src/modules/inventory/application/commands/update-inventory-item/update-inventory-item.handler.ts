import { Clock } from '../../../../../shared/application/ports/clock.port';
import { DomainEventPublisher } from '../../../../../shared/application/ports/domain-event-publisher.port';
import { Money } from '../../../../../shared/domain/value-objects/money';
import { InventoryItemNotFoundError } from '../../../domain/errors/inventory-item-not-found.error';
import { InventoryItemId } from '../../../domain/value-objects/inventory-item-id';
import { InventoryItemRepository } from '../../ports/inventory-item.repository';
import { UpdateInventoryItemCommand } from './update-inventory-item.command';

export class UpdateInventoryItemHandler {
  constructor(
    private readonly items: InventoryItemRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(command: UpdateInventoryItemCommand): Promise<void> {
    const itemId = InventoryItemId.create(command.itemId);
    const item = await this.items.findById(itemId);
    if (!item) {
      throw new InventoryItemNotFoundError();
    }

    const unitPrice =
      command.unitPriceCents !== undefined ? Money.fromCents(command.unitPriceCents) : undefined;

    // No `sku` field here at all: the count and the catalog identity are both create-only, only a
    // movement moves the count and nothing ever renames a SKU (INV-01 AC6, T4's updateDetails).
    item.updateDetails(
      { name: command.name, description: command.description, unitPrice },
      this.clock.now(),
    );
    await this.items.save(item);
    this.events.publish(item.pullDomainEvents());
  }
}
