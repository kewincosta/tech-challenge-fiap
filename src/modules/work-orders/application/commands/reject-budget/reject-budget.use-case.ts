import { Clock } from '../../../../../shared/application/ports/clock.port';
import { DomainEventPublisher } from '../../../../../shared/application/ports/domain-event-publisher.port';
import { WorkOrder } from '../../../domain/entities/work-order';
import { WorkOrderBudgetLinkOutdatedError } from '../../../domain/errors/work-order-budget-link-outdated.error';
import { WorkOrderNotFoundError } from '../../../domain/errors/work-order-not-found.error';
import { BudgetLinkVerifier } from '../../ports/budget-decision-links.port';
import { WorkOrderRepository } from '../../ports/work-order.repository';
import { BudgetId } from '../../../domain/value-objects/budget-id';
import { WorkOrderNumber } from '../../../domain/value-objects/work-order-number';
import { BudgetDecisionAuthorizer } from '../../services/budget-decision.authorizer';
import { RejectBudgetCommand } from './reject-budget.command';

export class RejectBudgetUseCase {
  constructor(
    private readonly workOrders: WorkOrderRepository,
    private readonly authorizer: BudgetDecisionAuthorizer,
    private readonly links: BudgetLinkVerifier,
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

    const budgetId = command.budgetId === undefined ? undefined : BudgetId.create(command.budgetId);
    if (budgetId !== undefined) {
      this.assertLinkIsCurrent(workOrder, budgetId, command.link);
    }
    // Round one returns to IN_DIAGNOSIS; a later round returns to IN_EXECUTION and records
    // ExecutionStarted too. The aggregate decides which, not this use case.
    workOrder.rejectBudget({
      budgetId,
      actorUserId: command.actorUserId,
      now: this.clock.now(),
    });
    await this.workOrders.save(workOrder);
    this.events.publish(workOrder.pullDomainEvents());
  }

  /**
   * A link names a budget by id, and a rejected round 1 is generated again under the same id, so
   * the link also has to belong to the generation the budget is in now. A budget the work order
   * does not hold is refused first.
   */
  private assertLinkIsCurrent(
    workOrder: WorkOrder,
    budgetId: BudgetId,
    link: string | undefined,
  ): void {
    const budget = workOrder.budgetById(budgetId);
    if (!this.links.isCurrent(budget.id.value, budget.generatedAt, link ?? '')) {
      throw new WorkOrderBudgetLinkOutdatedError();
    }
  }
}
