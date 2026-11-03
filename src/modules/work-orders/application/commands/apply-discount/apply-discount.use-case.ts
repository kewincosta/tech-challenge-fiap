import { Money } from '../../../../../shared/domain/value-objects/money';
import { Clock } from '../../../../../shared/application/ports/clock.port';
import { DomainEventPublisher } from '../../../../../shared/application/ports/domain-event-publisher.port';
import { WorkOrderNotFoundError } from '../../../domain/errors/work-order-not-found.error';
import { WorkOrderRepository } from '../../ports/work-order.repository';
import { WorkOrderNumber } from '../../../domain/value-objects/work-order-number';
import { ApplyDiscountCommand } from './apply-discount.command';

/** No authorizer - `work-orders:discount` on the route is the whole check (`AssignMechanicUseCase`'s
 * shape, minus the extra lookups that command needed and this one does not). */
export class ApplyDiscountUseCase {
  constructor(
    private readonly workOrders: WorkOrderRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
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
    this.events.publish(workOrder.pullDomainEvents());
  }
}
