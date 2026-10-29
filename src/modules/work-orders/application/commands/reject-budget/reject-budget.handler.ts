import { Clock } from '../../../../../shared/application/ports/clock.port';
import { DomainEventPublisher } from '../../../../../shared/application/ports/domain-event-publisher.port';
import { WorkOrderNotFoundError } from '../../../domain/errors/work-order-not-found.error';
import { WorkOrderRepository } from '../../ports/work-order.repository';
import { WorkOrderNumber } from '../../../domain/value-objects/work-order-number';
import { BudgetDecisionAuthorizer } from '../../services/budget-decision.authorizer';
import { RejectBudgetCommand } from './reject-budget.command';

export class RejectBudgetHandler {
  constructor(
    private readonly workOrders: WorkOrderRepository,
    private readonly authorizer: BudgetDecisionAuthorizer,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(command: RejectBudgetCommand): Promise<void> {
    const workOrder = await this.workOrders.findByNumber(
      WorkOrderNumber.create(command.workOrderNumber),
    );
    if (!workOrder) {
      throw new WorkOrderNotFoundError();
    }

    await this.authorizer.assertMayDecide(workOrder, command.actorUserId);

    // Round one returns to IN_DIAGNOSIS; a later round returns to IN_EXECUTION and records
    // ExecutionStarted too - the aggregate decides which, not this handler.
    workOrder.rejectBudget({ actorUserId: command.actorUserId, now: this.clock.now() });
    await this.workOrders.save(workOrder);
    this.events.publish(workOrder.pullDomainEvents());
  }
}
