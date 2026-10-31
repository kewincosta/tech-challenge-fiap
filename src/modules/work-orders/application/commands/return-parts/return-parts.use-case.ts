import { Clock } from '../../../../../shared/application/ports/clock.port';
import { DomainEventPublisher } from '../../../../../shared/application/ports/domain-event-publisher.port';
import { IdGenerator } from '../../../../../shared/application/ports/id-generator.port';
import { TransactionRunner } from '../../../../../shared/application/ports/transaction-runner.port';
import { WorkOrderNotFoundError } from '../../../domain/errors/work-order-not-found.error';
import { PendingStockSteps, StockStep, StockStepKind } from '../../ports/pending-stock-steps.port';
import { WorkOrderRepository } from '../../ports/work-order.repository';
import { StockStepApplier } from '../../services/stock-step-applier';
import { WorkOrderItemId } from '../../../domain/value-objects/work-order-item-id';
import { WorkOrderNumber } from '../../../domain/value-objects/work-order-number';
import { ReturnPartsCommand } from './return-parts.command';

/**
 * A return saves the work order and records a restore step in the work-orders outbox in one
 * transaction, then applies the step once that transaction has committed (CA-10). Inventory
 * restores the units in a transaction of its own, resolving which consumptions they undo from its
 * own ledger, so this side passes plain `{ inventoryItemId, quantity }` lines. When that attempt
 * fails the request still succeeds with the work order it saved, and the processor retries the step
 * until inventory takes it. The aggregate validates the whole batch first, purely in memory, so a
 * rejected batch writes nothing.
 */
export class ReturnPartsUseCase {
  constructor(
    private readonly workOrders: WorkOrderRepository,
    private readonly transactionRunner: TransactionRunner,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
    private readonly steps: PendingStockSteps,
    private readonly applier: StockStepApplier,
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

    const step: StockStep = {
      operationId: this.idGenerator.generate(),
      kind: StockStepKind.Restore,
      workOrderId: workOrder.id.value,
      actorUserId: command.actorUserId,
      lines: resolved.map((line) => ({
        inventoryItemId: line.inventoryItemId,
        quantity: line.quantity,
      })),
    };
    await this.transactionRunner.run(async () => {
      await this.workOrders.save(workOrder);
      await this.steps.enqueue(step);
    });
    await this.applier.applyAfterCommit(step.operationId);
    this.events.publish(workOrder.pullDomainEvents());
  }
}
