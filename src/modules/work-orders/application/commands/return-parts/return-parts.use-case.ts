import { Clock } from '../../../../../shared/application/ports/clock.port';
import { DomainEventPublisher } from '../../../../../shared/application/ports/domain-event-publisher.port';
import { TransactionRunner } from '../../../../../shared/application/ports/transaction-runner.port';
import { WorkOrderNotFoundError } from '../../../domain/errors/work-order-not-found.error';
import { StockLedger } from '../../ports/stock-ledger.port';
import { WorkOrderRepository } from '../../ports/work-order.repository';
import { WorkOrderItemId } from '../../../domain/value-objects/work-order-item-id';
import { WorkOrderNumber } from '../../../domain/value-objects/work-order-number';
import { ReturnPartsCommand } from './return-parts.command';

/**
 * Same transaction shape as `WithdrawPartsUseCase` (AD-008). Validates the whole batch on the
 * aggregate first, then opens `transactionRunner.run`, saves the work order, and restores the
 * stock through the ledger with plain `{ inventoryItemId, quantity }` lines. Which movements
 * that undoes is inventory's own job, resolved from its own ledger (see the T12 correction in
 * tasks.md). This side has no movement id to pass and needs none.
 */
export class ReturnPartsUseCase {
  constructor(
    private readonly workOrders: WorkOrderRepository,
    private readonly transactionRunner: TransactionRunner,
    private readonly clock: Clock,
    private readonly stockLedger: StockLedger,
    private readonly events: DomainEventPublisher,
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
      await this.stockLedger.restore(
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
