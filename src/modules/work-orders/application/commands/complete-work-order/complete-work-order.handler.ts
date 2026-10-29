import { Clock } from '../../../../../shared/application/ports/clock.port';
import { DomainEventPublisher } from '../../../../../shared/application/ports/domain-event-publisher.port';
import { WorkOrderNotFoundError } from '../../../domain/errors/work-order-not-found.error';
import { WorkOrderRepository } from '../../ports/work-order.repository';
import { WorkOrderNumber } from '../../../domain/value-objects/work-order-number';
import { WorkOrderCompletionAuthorizer } from '../../services/work-order-completion.authorizer';
import { CompleteWorkOrderCommand } from './complete-work-order.command';

export class CompleteWorkOrderHandler {
  constructor(
    private readonly workOrders: WorkOrderRepository,
    private readonly authorizer: WorkOrderCompletionAuthorizer,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(command: CompleteWorkOrderCommand): Promise<void> {
    const workOrder = await this.workOrders.findByNumber(
      WorkOrderNumber.create(command.workOrderNumber),
    );
    if (!workOrder) {
      throw new WorkOrderNotFoundError();
    }

    // Runs after the load, before the aggregate call - a refused actor never reaches save
    // (ApproveBudgetHandler's own shape).
    await this.authorizer.assertMayComplete(workOrder, command.actorUserId);

    workOrder.complete({ actorUserId: command.actorUserId, now: this.clock.now() });
    await this.workOrders.save(workOrder);
    this.events.publish(workOrder.pullDomainEvents());
  }
}
