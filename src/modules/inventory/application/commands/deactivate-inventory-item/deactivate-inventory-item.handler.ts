import { Clock } from '../../../../../shared/application/ports/clock.port';
import { DomainEventPublisher } from '../../../../../shared/application/ports/domain-event-publisher.port';
import { InventoryItemInUseError } from '../../../domain/errors/inventory-item-in-use.error';
import { InventoryItemNotFoundError } from '../../../domain/errors/inventory-item-not-found.error';
import { InventoryItemStatus } from '../../../domain/inventory-item-status';
import { InventoryItemId } from '../../../domain/value-objects/inventory-item-id';
import { InventoryItemRepository } from '../../ports/inventory-item.repository';
import { InventoryQueryPort } from '../../ports/inventory-query.port';
import { DeactivateInventoryItemCommand } from './deactivate-inventory-item.command';

/**
 * The soft delete of the catalog, in the shape `DeactivateServiceUseCase` established. The one
 * addition is the in-use guard: an item still planned on a work order that has not been delivered
 * or canceled cannot leave the catalog, because the work order would then hold a line nobody can
 * price or withdraw again.
 */
export class DeactivateInventoryItemHandler {
  constructor(
    private readonly items: InventoryItemRepository,
    private readonly inventoryQuery: InventoryQueryPort,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
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
    this.events.publish(item.pullDomainEvents());
  }
}
