import { Clock } from '../../../../../shared/application/ports/clock.port';
import { DomainEventPublisher } from '../../../../../shared/application/ports/domain-event-publisher.port';
import { TransactionRunner } from '../../../../../shared/application/ports/transaction-runner.port';
import { WorkOrderNotFoundError } from '../../../domain/errors/work-order-not-found.error';
import { StockLedger } from '../../ports/stock-ledger.port';
import { WorkOrderRepository } from '../../ports/work-order.repository';
import { WorkOrderItemId } from '../../../domain/value-objects/work-order-item-id';
import { WorkOrderNumber } from '../../../domain/value-objects/work-order-number';
import { WithdrawPartsCommand } from './withdraw-parts.command';

/**
 * Owns the write that spans two modules and two aggregates (AD-008). Validates the whole batch
 * on the aggregate first, purely in memory - a rejected batch never opens a transaction at all.
 * Only once the aggregate has accepted it does this open `transactionRunner.run`, save the work
 * order, and consume the stock through the ledger inside that same transaction, the structural
 * template `RegisterUserUseCase` already established for a cross-module write.
 */
export class WithdrawPartsHandler {
  constructor(
    private readonly workOrders: WorkOrderRepository,
    private readonly transactionRunner: TransactionRunner,
    private readonly clock: Clock,
    private readonly stockLedger: StockLedger,
    private readonly events: DomainEventPublisher,
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
      await this.stockLedger.consume(
        workOrder.id.value,
        resolved.map((line) => ({
          inventoryItemId: line.inventoryItemId,
          quantity: line.quantity,
        })),
        command.actorUserId,
      );
    });
    this.events.publish(workOrder.pullDomainEvents());
  }
}
