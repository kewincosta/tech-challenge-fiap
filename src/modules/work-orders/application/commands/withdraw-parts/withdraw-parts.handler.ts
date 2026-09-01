import { Inject } from '@nestjs/common';
import { CommandBus, CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs';
import { CLOCK, Clock } from '../../../../../shared/application/ports/clock.port';
import {
  TRANSACTION_RUNNER,
  TransactionRunner,
} from '../../../../../shared/application/ports/transaction-runner.port';
import { ConsumeStockBatchCommand } from '../../../../inventory/application/commands/consume-stock-batch/consume-stock-batch.command';
import { WorkOrderNotFoundError } from '../../../domain/errors/work-order-not-found.error';
import {
  WORK_ORDER_REPOSITORY,
  WorkOrderRepository,
} from '../../../domain/repositories/work-order.repository';
import { WorkOrderItemId } from '../../../domain/value-objects/work-order-item-id';
import { WorkOrderNumber } from '../../../domain/value-objects/work-order-number';
import { WithdrawPartsCommand } from './withdraw-parts.command';

/**
 * Owns the write that spans two modules and two aggregates (AD-008). Validates the whole batch
 * on the aggregate first, purely in memory - a rejected batch never opens a transaction at all.
 * Only once the aggregate has accepted it does this open `transactionRunner.run`, save the work
 * order, and dispatch `ConsumeStockBatchCommand` inside that same transaction, the structural
 * template `RegisterUserHandler` already established for a cross-module write.
 */
@CommandHandler(WithdrawPartsCommand)
export class WithdrawPartsHandler implements ICommandHandler<WithdrawPartsCommand, void> {
  constructor(
    @Inject(WORK_ORDER_REPOSITORY) private readonly workOrders: WorkOrderRepository,
    @Inject(TRANSACTION_RUNNER) private readonly transactionRunner: TransactionRunner,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly commandBus: CommandBus,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: WithdrawPartsCommand): Promise<void> {
    const workOrder = await this.workOrders.findByNumber(
      WorkOrderNumber.create(command.workOrderNumber),
    );
    if (!workOrder) {
      throw new WorkOrderNotFoundError();
    }

    const resolved = workOrder.withdrawParts({
      lines: command.lines.map((line) => ({
        itemId: WorkOrderItemId.create(line.itemId),
        quantity: line.quantity,
      })),
      actorUserId: command.actorUserId,
      now: this.clock.now(),
    });

    await this.transactionRunner.run(async () => {
      await this.workOrders.save(workOrder);
      await this.commandBus.execute(
        new ConsumeStockBatchCommand(
          resolved.map((line) => ({
            inventoryItemId: line.inventoryItemId,
            quantity: line.quantity,
          })),
          workOrder.id.value,
          command.actorUserId,
        ),
      );
    });
    this.eventBus.publishAll(workOrder.pullDomainEvents());
  }
}
