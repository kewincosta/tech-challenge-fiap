import { Clock } from '../../../../../shared/application/ports/clock.port';
import { DomainEventPublisher } from '../../../../../shared/application/ports/domain-event-publisher.port';
import { IdGenerator } from '../../../../../shared/application/ports/id-generator.port';
import { Money } from '../../../../../shared/domain/value-objects/money';
import { InventoryItemInactiveError } from '../../../domain/errors/inventory-item-inactive.error';
import { ReferencedInventoryItemNotFoundError } from '../../../domain/errors/referenced-inventory-item-not-found.error';
import { WorkOrderNotFoundError } from '../../../domain/errors/work-order-not-found.error';
import { PartCatalog } from '../../ports/part-catalog.port';
import { WorkOrderRepository } from '../../ports/work-order.repository';
import { PlannedQuantity } from '../../../domain/value-objects/planned-quantity';
import { WorkOrderItemId } from '../../../domain/value-objects/work-order-item-id';
import { WorkOrderNumber } from '../../../domain/value-objects/work-order-number';
import { PlanPartCommand } from './plan-part.command';

export class PlanPartUseCase {
  constructor(
    private readonly workOrders: WorkOrderRepository,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
    private readonly partCatalog: PartCatalog,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(command: PlanPartCommand): Promise<void> {
    const workOrder = await this.workOrders.findByNumber(
      WorkOrderNumber.create(command.workOrderNumber),
    );
    if (!workOrder) {
      throw new WorkOrderNotFoundError();
    }

    // Validated before the read: a malformed quantity needs no round trip to find out.
    const plannedQuantity = PlannedQuantity.create(command.quantity);

    const inventoryItem = await this.partCatalog.findById(command.inventoryItemId);
    if (!inventoryItem) {
      throw new ReferencedInventoryItemNotFoundError();
    }
    // Same gate AddRequestedServiceUseCase applies to a deactivated service: an item off the
    // catalog does not enter a new work order, while the parts already planned on open work
    // orders stay valid - which is also what DeactivateInventoryItemUseCase refuses on.
    if (!inventoryItem.active) {
      throw new InventoryItemInactiveError();
    }

    // This use case holds a read-only part catalog and no stock ledger: the stock cannot be
    // touched from here, only read from, which is what "planning" without withdrawing means
    // (rule 21, inventory owns its counts).
    workOrder.planPart({
      itemId: WorkOrderItemId.create(this.idGenerator.generate()),
      inventoryItemId: command.inventoryItemId,
      sku: inventoryItem.sku,
      itemName: inventoryItem.name,
      unitPrice: Money.fromCents(inventoryItem.unitPriceCents),
      plannedQuantity,
      actorUserId: command.actorUserId,
      now: this.clock.now(),
    });
    await this.workOrders.save(workOrder);
    this.events.publish(workOrder.pullDomainEvents());
  }
}
