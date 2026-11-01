import { ConcurrentModificationError } from '../../../../../shared/application/errors/concurrent-modification.error';
import { Clock } from '../../../../../shared/application/ports/clock.port';
import { DomainEventPublisher } from '../../../../../shared/application/ports/domain-event-publisher.port';
import { IdGenerator } from '../../../../../shared/application/ports/id-generator.port';
import { TransactionRunner } from '../../../../../shared/application/ports/transaction-runner.port';
import { WorkOrderNotFoundError } from '../../../domain/errors/work-order-not-found.error';
import { OutboxSettings } from '../../outbox-settings';
import { PendingStockSteps, StockStep, StockStepKind } from '../../ports/pending-stock-steps.port';
import { StockLedger } from '../../ports/stock-ledger.port';
import { WorkOrderRepository } from '../../ports/work-order.repository';
import { StockStepApplier } from '../../services/stock-step-applier';
import { WorkOrderItemId } from '../../../domain/value-objects/work-order-item-id';
import { WorkOrderNumber } from '../../../domain/value-objects/work-order-number';
import { WithdrawPartsCommand } from './withdraw-parts.command';

/**
 * A withdrawal moves stock and saves the work order, and each module commits only its own data
 * (CA-10). The aggregate validates the whole batch first, purely in memory, so a rejected batch
 * writes nothing. After that the use case takes three steps:
 *
 * 1. It arms an undo step in the work-orders outbox, due after the grace period.
 * 2. Inventory consumes the stock in its own transaction, tagging the movements with the step's
 *    operation id.
 * 3. One work-orders transaction disarms the step, saves the work order and records a confirmation
 *    step that carries the operation id of the consumption.
 *
 * Once that transaction has committed, the request applies the confirmation. Until inventory has
 * confirmed them, the consumptions belong to the undo alone, and a failed attempt never fails the
 * request: the processor applies the confirmation later.
 *
 * If the consumption or the last step fails, the request gives the units back at once, completes
 * the step and answers the first error, and no confirmation step exists. A process that stops
 * between the steps leaves the armed step behind, and the processor undoes the consumption once
 * the grace period has passed. When the processor claimed the step before the request reached the
 * last step, the disarm finds it taken and the request answers 409: the work order stays unsaved
 * and the units go back.
 */
export class WithdrawPartsUseCase {
  constructor(
    private readonly workOrders: WorkOrderRepository,
    private readonly transactionRunner: TransactionRunner,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
    private readonly stockLedger: StockLedger,
    private readonly steps: PendingStockSteps,
    private readonly applier: StockStepApplier,
    private readonly settings: OutboxSettings,
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

    const step: StockStep = {
      operationId: this.idGenerator.generate(),
      kind: StockStepKind.UndoConsumption,
      workOrderId: workOrder.id.value,
      actorUserId: command.actorUserId,
    };
    // The confirmation has an operation id of its own, because the id of each step is unique, and
    // carries the id the consumption is tagged with.
    const confirmation: StockStep = {
      operationId: this.idGenerator.generate(),
      kind: StockStepKind.ConfirmConsumption,
      workOrderId: step.workOrderId,
      actorUserId: step.actorUserId,
      consumptionOperationId: step.operationId,
    };
    const dueAt = new Date(this.clock.now().getTime() + this.settings.graceSeconds * 1000);
    // Nothing is consumed yet, so a failure here has nothing to undo.
    await this.steps.arm(step, dueAt);

    try {
      await this.stockLedger.consume(
        step.workOrderId,
        resolved.map((line) => ({
          inventoryItemId: line.inventoryItemId,
          quantity: line.quantity,
        })),
        step.actorUserId,
        step.operationId,
      );
      await this.transactionRunner.run(async () => {
        if (!(await this.steps.disarm(step.operationId))) {
          throw new ConcurrentModificationError();
        }
        await this.workOrders.save(workOrder);
        await this.steps.enqueue(confirmation);
      });
    } catch (error) {
      await this.compensate(step);
      throw error;
    }
    this.events.publish(workOrder.pullDomainEvents());
    await this.applier.applyAfterCommit(confirmation.operationId);
  }

  /**
   * Gives the consumed units back and completes the step, without claiming it: an undo changes
   * nothing on a repeat, so it can run while the processor holds the step, and it also returns the
   * units of a consumption that committed after the processor's undo found nothing. An undo that
   * fails hands the step to the processor at once, because the request has no other way to finish
   * it. The caller rethrows its own error, so nothing here may throw.
   */
  private async compensate(step: StockStep): Promise<void> {
    try {
      await this.stockLedger.undoConsumption(step.operationId, step.actorUserId);
      await this.steps.complete(step.operationId);
    } catch {
      await this.handToProcessor(step);
    }
  }

  /**
   * `release` makes an armed step due now and leaves a step the processor already holds alone,
   * where `recordFailure` would also cut short the lease of a claim that is still working.
   */
  private async handToProcessor(step: StockStep): Promise<void> {
    try {
      await this.steps.release(step.operationId);
    } catch {
      // The step stays armed, and the processor undoes it once its grace period has passed.
    }
  }
}
