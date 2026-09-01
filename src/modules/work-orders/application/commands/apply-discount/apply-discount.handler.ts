import { Inject } from '@nestjs/common';
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs';
import { Money } from '../../../../../shared/domain/value-objects/money';
import { CLOCK, Clock } from '../../../../../shared/application/ports/clock.port';
import { WorkOrderNotFoundError } from '../../../domain/errors/work-order-not-found.error';
import {
  WORK_ORDER_REPOSITORY,
  WorkOrderRepository,
} from '../../../domain/repositories/work-order.repository';
import { WorkOrderNumber } from '../../../domain/value-objects/work-order-number';
import { ApplyDiscountCommand } from './apply-discount.command';

/** No authorizer - `work-orders:discount` on the route is the whole check (`AssignMechanicHandler`'s
 * shape, minus the extra lookups that command needed and this one does not). */
@CommandHandler(ApplyDiscountCommand)
export class ApplyDiscountHandler implements ICommandHandler<ApplyDiscountCommand, void> {
  constructor(
    @Inject(WORK_ORDER_REPOSITORY) private readonly workOrders: WorkOrderRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: ApplyDiscountCommand): Promise<void> {
    const workOrder = await this.workOrders.findByNumber(
      WorkOrderNumber.create(command.workOrderNumber),
    );
    if (!workOrder) {
      throw new WorkOrderNotFoundError();
    }

    workOrder.applyDiscount({
      amount: Money.fromCents(command.amountCents),
      note: command.note,
      actorUserId: command.actorUserId,
      now: this.clock.now(),
    });
    await this.workOrders.save(workOrder);
    this.eventBus.publishAll(workOrder.pullDomainEvents());
  }
}
