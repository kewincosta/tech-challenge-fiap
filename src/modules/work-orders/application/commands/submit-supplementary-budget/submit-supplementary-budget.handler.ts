import { Inject } from '@nestjs/common';
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs';
import { CLOCK, Clock } from '../../../../../shared/application/ports/clock.port';
import {
  ID_GENERATOR,
  IdGenerator,
} from '../../../../../shared/application/ports/id-generator.port';
import { WorkOrderNotFoundError } from '../../../domain/errors/work-order-not-found.error';
import {
  WORK_ORDER_REPOSITORY,
  WorkOrderRepository,
} from '../../../domain/repositories/work-order.repository';
import { BudgetId } from '../../../domain/value-objects/budget-id';
import { WorkOrderNumber } from '../../../domain/value-objects/work-order-number';
import { SubmitSupplementaryBudgetCommand } from './submit-supplementary-budget.command';

@CommandHandler(SubmitSupplementaryBudgetCommand)
export class SubmitSupplementaryBudgetHandler implements ICommandHandler<
  SubmitSupplementaryBudgetCommand,
  void
> {
  constructor(
    @Inject(WORK_ORDER_REPOSITORY) private readonly workOrders: WorkOrderRepository,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: SubmitSupplementaryBudgetCommand): Promise<void> {
    const workOrder = await this.workOrders.findByNumber(
      WorkOrderNumber.create(command.workOrderNumber),
    );
    if (!workOrder) {
      throw new WorkOrderNotFoundError();
    }

    // No price and no total ever come from the caller - rule 29 holds by construction.
    workOrder.submitSupplementaryBudget({
      budgetId: BudgetId.create(this.idGenerator.generate()),
      actorUserId: command.actorUserId,
      now: this.clock.now(),
    });
    await this.workOrders.save(workOrder);
    this.eventBus.publishAll(workOrder.pullDomainEvents());
  }
}
