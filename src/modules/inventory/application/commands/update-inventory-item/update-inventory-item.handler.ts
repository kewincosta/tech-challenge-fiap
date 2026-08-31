import { Inject } from '@nestjs/common';
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs';
import { CLOCK, Clock } from '../../../../../shared/application/ports/clock.port';
import { Money } from '../../../../../shared/domain/value-objects/money';
import { InventoryItemNotFoundError } from '../../../domain/errors/inventory-item-not-found.error';
import {
  INVENTORY_ITEM_REPOSITORY,
  InventoryItemRepository,
} from '../../../domain/repositories/inventory-item.repository';
import { InventoryItemId } from '../../../domain/value-objects/inventory-item-id';
import { UpdateInventoryItemCommand } from './update-inventory-item.command';

@CommandHandler(UpdateInventoryItemCommand)
export class UpdateInventoryItemHandler implements ICommandHandler<
  UpdateInventoryItemCommand,
  void
> {
  constructor(
    @Inject(INVENTORY_ITEM_REPOSITORY) private readonly items: InventoryItemRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly eventBus: EventBus,
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
    this.eventBus.publishAll(item.pullDomainEvents());
  }
}
