import { Inject } from '@nestjs/common';
import { CommandBus, CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs';
import { CLOCK, Clock } from '../../../../../shared/application/ports/clock.port';
import {
  TRANSACTION_RUNNER,
  TransactionRunner,
} from '../../../../../shared/application/ports/transaction-runner.port';
import { WriteOffStockMovementsCommand } from '../../../../inventory/application/commands/write-off-stock-movements/write-off-stock-movements.command';
import { WorkOrderNotFoundError } from '../../../domain/errors/work-order-not-found.error';
import {
  WORK_ORDER_REPOSITORY,
  WorkOrderRepository,
} from '../../../domain/repositories/work-order.repository';
import { WorkOrderNumber } from '../../../domain/value-objects/work-order-number';
import { CancellationAuthorizer } from '../../services/cancellation.authorizer';
import { CancelWorkOrderCommand } from './cancel-work-order.command';

/**
 * Owns the write that spans two modules (AD-008), `DeliverVehicleHandler`'s shape, with the
 * authorizer running between the load and the aggregate call (`CompleteWorkOrderHandler`'s
 * shape). Always dispatches `WriteOffStockMovementsCommand`, even when the aggregate carries no
 * outstanding withdrawal - deciding whether there is anything to write off is the inventory
 * side's own job, not this handler's (spec.md's edge case: a work order that withdrew nothing
 * cancels cleanly, and the dispatched command simply writes off nothing).
 */
@CommandHandler(CancelWorkOrderCommand)
export class CancelWorkOrderHandler implements ICommandHandler<CancelWorkOrderCommand, void> {
  constructor(
    @Inject(WORK_ORDER_REPOSITORY) private readonly workOrders: WorkOrderRepository,
    @Inject(TRANSACTION_RUNNER) private readonly transactionRunner: TransactionRunner,
    private readonly authorizer: CancellationAuthorizer,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly commandBus: CommandBus,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: CancelWorkOrderCommand): Promise<void> {
    const workOrder = await this.workOrders.findByNumber(
      WorkOrderNumber.create(command.workOrderNumber),
    );
    if (!workOrder) {
      throw new WorkOrderNotFoundError();
    }

    await this.authorizer.assertMayCancel(workOrder, command.actorUserId);

    workOrder.cancel({
      reason: command.reason,
      actorUserId: command.actorUserId,
      now: this.clock.now(),
    });

    await this.transactionRunner.run(async () => {
      await this.workOrders.save(workOrder);
      await this.commandBus.execute(
        new WriteOffStockMovementsCommand(workOrder.id.value, command.actorUserId),
      );
    });
    this.eventBus.publishAll(workOrder.pullDomainEvents());
  }
}
