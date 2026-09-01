import { Inject } from '@nestjs/common';
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs';
import { CLOCK, Clock } from '../../../../../shared/application/ports/clock.port';
import { WorkOrderNotFoundError } from '../../../domain/errors/work-order-not-found.error';
import {
  WORK_ORDER_REPOSITORY,
  WorkOrderRepository,
} from '../../../domain/repositories/work-order.repository';
import { WorkOrderNumber } from '../../../domain/value-objects/work-order-number';
import { WorkOrderCompletionAuthorizer } from '../../services/work-order-completion.authorizer';
import { CompleteWorkOrderCommand } from './complete-work-order.command';

@CommandHandler(CompleteWorkOrderCommand)
export class CompleteWorkOrderHandler implements ICommandHandler<CompleteWorkOrderCommand, void> {
  constructor(
    @Inject(WORK_ORDER_REPOSITORY) private readonly workOrders: WorkOrderRepository,
    private readonly authorizer: WorkOrderCompletionAuthorizer,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly eventBus: EventBus,
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
    this.eventBus.publishAll(workOrder.pullDomainEvents());
  }
}
