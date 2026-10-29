import { Clock } from '../../../../../shared/application/ports/clock.port';
import { DomainEventPublisher } from '../../../../../shared/application/ports/domain-event-publisher.port';
import { WorkOrderNotFoundError } from '../../../domain/errors/work-order-not-found.error';
import { WorkOrderRepository } from '../../ports/work-order.repository';
import { WorkOrderNumber } from '../../../domain/value-objects/work-order-number';
import { BudgetDecisionAuthorizer } from '../../services/budget-decision.authorizer';
import { ApproveBudgetCommand } from './approve-budget.command';

export class ApproveBudgetHandler {
  constructor(
    private readonly workOrders: WorkOrderRepository,
    private readonly authorizer: BudgetDecisionAuthorizer,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(command: ApproveBudgetCommand): Promise<void> {
    const workOrder = await this.workOrders.findByNumber(
      WorkOrderNumber.create(command.workOrderNumber),
    );
    if (!workOrder) {
      throw new WorkOrderNotFoundError();
    }

    // Runs after the load, before the aggregate call - an actor the authorizer refuses never
    // reaches save (design.md).
    await this.authorizer.assertMayDecide(workOrder, command.actorUserId);

    workOrder.approveBudget({ actorUserId: command.actorUserId, now: this.clock.now() });
    await this.workOrders.save(workOrder);
    this.events.publish(workOrder.pullDomainEvents());
  }
}
