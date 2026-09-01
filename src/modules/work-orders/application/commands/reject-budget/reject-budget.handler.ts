import { Inject } from '@nestjs/common';
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs';
import { CLOCK, Clock } from '../../../../../shared/application/ports/clock.port';
import { WorkOrderNotFoundError } from '../../../domain/errors/work-order-not-found.error';
import {
  WORK_ORDER_REPOSITORY,
  WorkOrderRepository,
} from '../../../domain/repositories/work-order.repository';
import { WorkOrderNumber } from '../../../domain/value-objects/work-order-number';
import { BudgetDecisionAuthorizer } from '../../services/budget-decision.authorizer';
import { RejectBudgetCommand } from './reject-budget.command';

@CommandHandler(RejectBudgetCommand)
export class RejectBudgetHandler implements ICommandHandler<RejectBudgetCommand, void> {
  constructor(
    @Inject(WORK_ORDER_REPOSITORY) private readonly workOrders: WorkOrderRepository,
    private readonly authorizer: BudgetDecisionAuthorizer,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly eventBus: EventBus,
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
    this.eventBus.publishAll(workOrder.pullDomainEvents());
  }
}
