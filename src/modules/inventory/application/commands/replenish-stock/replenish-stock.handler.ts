import { Inject } from '@nestjs/common';
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs';
import { CLOCK, Clock } from '../../../../../shared/application/ports/clock.port';
import {
  ID_GENERATOR,
  IdGenerator,
} from '../../../../../shared/application/ports/id-generator.port';
import { Money } from '../../../../../shared/domain/value-objects/money';
import { InventoryItemNotFoundError } from '../../../domain/errors/inventory-item-not-found.error';
import {
  INVENTORY_ITEM_REPOSITORY,
  InventoryItemRepository,
} from '../../../domain/repositories/inventory-item.repository';
import { InventoryItemId } from '../../../domain/value-objects/inventory-item-id';
import { StockMovementId } from '../../../domain/value-objects/stock-movement-id';
import { ReplenishStockCommand } from './replenish-stock.command';

@CommandHandler(ReplenishStockCommand)
export class ReplenishStockHandler implements ICommandHandler<ReplenishStockCommand, void> {
  constructor(
    @Inject(INVENTORY_ITEM_REPOSITORY) private readonly items: InventoryItemRepository,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: ReplenishStockCommand): Promise<void> {
    const item = await this.items.findById(InventoryItemId.create(command.itemId));
    if (!item) {
      throw new InventoryItemNotFoundError();
    }

    // The aggregate owns the arithmetic and the quantity rule (InvalidMovementQuantityError) - this
    // handler computes nothing, so a future caller cannot bypass either by calling it differently.
    item.replenish({
      quantity: command.quantity,
      unitPrice: Money.fromCents(command.unitPriceCents),
      actorUserId: command.actorUserId,
      note: command.note,
      movementId: StockMovementId.create(this.idGenerator.generate()),
      now: this.clock.now(),
    });
    await this.items.save(item);
    this.eventBus.publishAll(item.pullDomainEvents());
  }
}
