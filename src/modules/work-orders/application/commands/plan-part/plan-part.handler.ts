import { Inject } from '@nestjs/common';
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs';
import { CLOCK, ID_GENERATOR } from '../../../../../shared/shared.tokens';
import { Clock } from '../../../../../shared/application/ports/clock.port';
import { IdGenerator } from '../../../../../shared/application/ports/id-generator.port';
import { Money } from '../../../../../shared/domain/value-objects/money';
import { InventoryItemInactiveError } from '../../../domain/errors/inventory-item-inactive.error';
import { ReferencedInventoryItemNotFoundError } from '../../../domain/errors/referenced-inventory-item-not-found.error';
import { WorkOrderNotFoundError } from '../../../domain/errors/work-order-not-found.error';
import { PartCatalog } from '../../ports/part-catalog.port';
import { WorkOrderRepository } from '../../ports/work-order.repository';
import { PART_CATALOG, WORK_ORDER_REPOSITORY } from '../../../work-orders.tokens';
import { PlannedQuantity } from '../../../domain/value-objects/planned-quantity';
import { WorkOrderItemId } from '../../../domain/value-objects/work-order-item-id';
import { WorkOrderNumber } from '../../../domain/value-objects/work-order-number';
import { PlanPartCommand } from './plan-part.command';

@CommandHandler(PlanPartCommand)
export class PlanPartHandler implements ICommandHandler<PlanPartCommand, void> {
  constructor(
    @Inject(WORK_ORDER_REPOSITORY) private readonly workOrders: WorkOrderRepository,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(PART_CATALOG) private readonly partCatalog: PartCatalog,
    private readonly eventBus: EventBus,
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
    // Same gate AddRequestedServiceHandler applies to a deactivated service: an item off the
    // catalog does not enter a new work order, while the parts already planned on open work
    // orders stay valid - which is also what DeactivateInventoryItemHandler refuses on.
    if (!inventoryItem.active) {
      throw new InventoryItemInactiveError();
    }

    // This handler has no CommandBus: the stock cannot be touched from here, only read from,
    // which is what "planning" without withdrawing means (rule 21, inventory owns its counts).
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
    this.eventBus.publishAll(workOrder.pullDomainEvents());
  }
}
