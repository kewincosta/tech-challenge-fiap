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
import { ApproveBudgetCommand } from './approve-budget.command';

@CommandHandler(ApproveBudgetCommand)
export class ApproveBudgetHandler implements ICommandHandler<ApproveBudgetCommand, void> {
  constructor(
    @Inject(WORK_ORDER_REPOSITORY) private readonly workOrders: WorkOrderRepository,
    private readonly authorizer: BudgetDecisionAuthorizer,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly eventBus: EventBus,
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
    this.eventBus.publishAll(workOrder.pullDomainEvents());
  }
}
