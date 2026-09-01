import { Inject } from '@nestjs/common';
import { CommandHandler, EventBus, ICommandHandler, QueryBus } from '@nestjs/cqrs';
import { CLOCK, Clock } from '../../../../../shared/application/ports/clock.port';
import {
  ID_GENERATOR,
  IdGenerator,
} from '../../../../../shared/application/ports/id-generator.port';
import { Money } from '../../../../../shared/domain/value-objects/money';
import { InventoryItemSummaryDto } from '../../../../inventory/application/ports/inventory-query.port';
import { GetInventoryItemQuery } from '../../../../inventory/application/queries/get-inventory-item/get-inventory-item.query';
import { ReferencedInventoryItemNotFoundError } from '../../../domain/errors/referenced-inventory-item-not-found.error';
import { WorkOrderNotFoundError } from '../../../domain/errors/work-order-not-found.error';
import {
  WORK_ORDER_REPOSITORY,
  WorkOrderRepository,
} from '../../../domain/repositories/work-order.repository';
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
    private readonly queryBus: QueryBus,
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

    const inventoryItem = await this.queryBus.execute<
      GetInventoryItemQuery,
      InventoryItemSummaryDto | null
    >(new GetInventoryItemQuery(command.inventoryItemId));
    if (!inventoryItem) {
      throw new ReferencedInventoryItemNotFoundError();
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
