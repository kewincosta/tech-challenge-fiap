import { Inject } from '@nestjs/common';
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs';
import { CLOCK, Clock } from '../../../../../shared/application/ports/clock.port';
import { InventoryItemInUseError } from '../../../domain/errors/inventory-item-in-use.error';
import { InventoryItemNotFoundError } from '../../../domain/errors/inventory-item-not-found.error';
import { InventoryItemStatus } from '../../../domain/inventory-item-status';
import {
  INVENTORY_ITEM_REPOSITORY,
  InventoryItemRepository,
} from '../../../domain/repositories/inventory-item.repository';
import { InventoryItemId } from '../../../domain/value-objects/inventory-item-id';
import { INVENTORY_QUERY_PORT, InventoryQueryPort } from '../../ports/inventory-query.port';
import { DeactivateInventoryItemCommand } from './deactivate-inventory-item.command';

/**
 * The soft delete of the catalog, in the shape `DeactivateServiceHandler` established. The one
 * addition is the in-use guard: an item still planned on a work order that has not been delivered
 * or canceled cannot leave the catalog, because the work order would then hold a line nobody can
 * price or withdraw again.
 */
@CommandHandler(DeactivateInventoryItemCommand)
export class DeactivateInventoryItemHandler
  implements ICommandHandler<DeactivateInventoryItemCommand, void>
{
  constructor(
    @Inject(INVENTORY_ITEM_REPOSITORY) private readonly items: InventoryItemRepository,
    @Inject(INVENTORY_QUERY_PORT) private readonly inventoryQuery: InventoryQueryPort,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: DeactivateInventoryItemCommand): Promise<void> {
    const item = await this.items.findById(InventoryItemId.create(command.inventoryItemId));
    if (!item) {
      throw new InventoryItemNotFoundError();
    }

    // Read before the mutation, and skipped once the item is already inactive: a second
    // deactivation is a no-op that must stay idempotent even while a work order holds the item,
    // otherwise the same call would answer 204 and then 409 for the same state.
    if (item.status !== InventoryItemStatus.Inactive) {
      const workOrderNumbers = await this.inventoryQuery.listOpenWorkOrderNumbersUsing(
        command.inventoryItemId,
      );
      if (workOrderNumbers.length > 0) {
        throw new InventoryItemInUseError(workOrderNumbers);
      }
    }

    item.deactivate(this.clock.now());
    await this.items.save(item);
    this.eventBus.publishAll(item.pullDomainEvents());
  }
}
