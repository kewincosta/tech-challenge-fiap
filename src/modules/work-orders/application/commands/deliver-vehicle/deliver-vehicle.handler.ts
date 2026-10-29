import { Inject } from '@nestjs/common';
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs';
import { CLOCK, TRANSACTION_RUNNER } from '../../../../../shared/shared.tokens';
import { Clock } from '../../../../../shared/application/ports/clock.port';
import { TransactionRunner } from '../../../../../shared/application/ports/transaction-runner.port';
import { WorkOrderNotFoundError } from '../../../domain/errors/work-order-not-found.error';
import { StockLedger } from '../../ports/stock-ledger.port';
import { WorkOrderRepository } from '../../ports/work-order.repository';
import { STOCK_LEDGER, WORK_ORDER_REPOSITORY } from '../../../work-orders.tokens';
import { WorkOrderNumber } from '../../../domain/value-objects/work-order-number';
import { DeliverVehicleCommand } from './deliver-vehicle.command';

/**
 * Owns the write that spans two modules (AD-008), `WithdrawPartsHandler`'s shape. The aggregate
 * validates the transition purely in memory first - a refused delivery never opens a transaction
 * at all. Only once it is accepted does this open `transactionRunner.run`, save the work order,
 * and settle the stock through the ledger inside that same transaction.
 */
@CommandHandler(DeliverVehicleCommand)
export class DeliverVehicleHandler implements ICommandHandler<DeliverVehicleCommand, void> {
  constructor(
    @Inject(WORK_ORDER_REPOSITORY) private readonly workOrders: WorkOrderRepository,
    @Inject(TRANSACTION_RUNNER) private readonly transactionRunner: TransactionRunner,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(STOCK_LEDGER) private readonly stockLedger: StockLedger,
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
      await this.stockLedger.settle(workOrder.id.value, command.actorUserId);
    });
    this.eventBus.publishAll(workOrder.pullDomainEvents());
  }
}
