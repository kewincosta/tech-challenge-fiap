import { Inject } from '@nestjs/common';
import { CommandBus, CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs';
import { CLOCK, Clock } from '../../../../../shared/application/ports/clock.port';
import {
  TRANSACTION_RUNNER,
  TransactionRunner,
} from '../../../../../shared/application/ports/transaction-runner.port';
import { RestoreStockBatchCommand } from '../../../../inventory/application/commands/restore-stock-batch/restore-stock-batch.command';
import { WorkOrderNotFoundError } from '../../../domain/errors/work-order-not-found.error';
import {
  WORK_ORDER_REPOSITORY,
  WorkOrderRepository,
} from '../../../domain/repositories/work-order.repository';
import { WorkOrderItemId } from '../../../domain/value-objects/work-order-item-id';
import { WorkOrderNumber } from '../../../domain/value-objects/work-order-number';
import { ReturnPartsCommand } from './return-parts.command';

/**
 * Same transaction shape as `WithdrawPartsHandler` (AD-008). Validates the whole batch on the
 * aggregate first, then opens `transactionRunner.run`, saves the work order, and dispatches
 * `RestoreStockBatchCommand` with plain `{ inventoryItemId, quantity }` lines - which movement(s)
 * that undoes is `RestoreStockBatchHandler`'s own job, resolved from inventory's own ledger (see
 * the T12 correction in tasks.md). This side has no movement id to pass and needs none.
 */
@CommandHandler(ReturnPartsCommand)
export class ReturnPartsHandler implements ICommandHandler<ReturnPartsCommand, void> {
  constructor(
    @Inject(WORK_ORDER_REPOSITORY) private readonly workOrders: WorkOrderRepository,
    @Inject(TRANSACTION_RUNNER) private readonly transactionRunner: TransactionRunner,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly commandBus: CommandBus,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: ReturnPartsCommand): Promise<void> {
    const workOrder = await this.workOrders.findByNumber(
      WorkOrderNumber.create(command.workOrderNumber),
    );
    if (!workOrder) {
      throw new WorkOrderNotFoundError();
    }

    const resolved = workOrder.returnParts({
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
        new RestoreStockBatchCommand(
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
