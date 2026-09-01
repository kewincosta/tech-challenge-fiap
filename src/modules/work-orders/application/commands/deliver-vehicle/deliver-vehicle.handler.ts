import { Inject } from '@nestjs/common';
import { CommandBus, CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs';
import { CLOCK, Clock } from '../../../../../shared/application/ports/clock.port';
import {
  TRANSACTION_RUNNER,
  TransactionRunner,
} from '../../../../../shared/application/ports/transaction-runner.port';
import { SettleStockMovementsCommand } from '../../../../inventory/application/commands/settle-stock-movements/settle-stock-movements.command';
import { WorkOrderNotFoundError } from '../../../domain/errors/work-order-not-found.error';
import {
  WORK_ORDER_REPOSITORY,
  WorkOrderRepository,
} from '../../../domain/repositories/work-order.repository';
import { WorkOrderNumber } from '../../../domain/value-objects/work-order-number';
import { DeliverVehicleCommand } from './deliver-vehicle.command';

/**
 * Owns the write that spans two modules (AD-008), `WithdrawPartsHandler`'s shape. The aggregate
 * validates the transition purely in memory first - a refused delivery never opens a transaction
 * at all. Only once it is accepted does this open `transactionRunner.run`, save the work order,
 * and dispatch `SettleStockMovementsCommand` inside that same transaction.
 */
@CommandHandler(DeliverVehicleCommand)
export class DeliverVehicleHandler implements ICommandHandler<DeliverVehicleCommand, void> {
  constructor(
    @Inject(WORK_ORDER_REPOSITORY) private readonly workOrders: WorkOrderRepository,
    @Inject(TRANSACTION_RUNNER) private readonly transactionRunner: TransactionRunner,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly commandBus: CommandBus,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: DeliverVehicleCommand): Promise<void> {
    const workOrder = await this.workOrders.findByNumber(
      WorkOrderNumber.create(command.workOrderNumber),
    );
    if (!workOrder) {
      throw new WorkOrderNotFoundError();
    }

    workOrder.deliver({ actorUserId: command.actorUserId, now: this.clock.now() });

    await this.transactionRunner.run(async () => {
      await this.workOrders.save(workOrder);
      await this.commandBus.execute(
        new SettleStockMovementsCommand(workOrder.id.value, command.actorUserId),
      );
    });
    this.eventBus.publishAll(workOrder.pullDomainEvents());
  }
}
