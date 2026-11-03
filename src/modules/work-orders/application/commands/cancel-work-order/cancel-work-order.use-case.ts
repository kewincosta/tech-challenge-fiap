import { Clock } from '../../../../../shared/application/ports/clock.port';
import { DomainEventPublisher } from '../../../../../shared/application/ports/domain-event-publisher.port';
import { IdGenerator } from '../../../../../shared/application/ports/id-generator.port';
import { TransactionRunner } from '../../../../../shared/application/ports/transaction-runner.port';
import { WorkOrderNotFoundError } from '../../../domain/errors/work-order-not-found.error';
import { PendingStockSteps, StockStep, StockStepKind } from '../../ports/pending-stock-steps.port';
import { WorkOrderRepository } from '../../ports/work-order.repository';
import { WorkOrderNumber } from '../../../domain/value-objects/work-order-number';
import { CancellationAuthorizer } from '../../services/cancellation.authorizer';
import { StockStepApplier } from '../../services/stock-step-applier';
import { CancelWorkOrderCommand } from './cancel-work-order.command';

/**
 * A cancellation saves the work order and records a write-off step in the work-orders outbox in
 * one transaction, then applies the step once that transaction has committed (CA-10), the shape of
 * `DeliverVehicleUseCase`, with the authorizer running between the load and the aggregate call
 * (`CompleteWorkOrderUseCase`'s shape). It always records the step, even when the aggregate
 * carries no outstanding withdrawal: deciding whether there is anything to write off is the
 * inventory side's own job (spec.md's edge case: a work order that withdrew nothing cancels
 * cleanly, and inventory writes off nothing). When the attempt fails the request still succeeds
 * with the work order it saved, and the processor retries the step.
 */
export class CancelWorkOrderUseCase {
  constructor(
    private readonly workOrders: WorkOrderRepository,
    private readonly transactionRunner: TransactionRunner,
    private readonly authorizer: CancellationAuthorizer,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
    private readonly steps: PendingStockSteps,
    private readonly applier: StockStepApplier,
    private readonly events: DomainEventPublisher,
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

    const step: StockStep = {
      operationId: this.idGenerator.generate(),
      kind: StockStepKind.WriteOff,
      workOrderId: workOrder.id.value,
      actorUserId: command.actorUserId,
    };
    await this.transactionRunner.run(async () => {
      await this.workOrders.save(workOrder);
      await this.steps.enqueue(step);
    });
    await this.applier.applyAfterCommit(step.operationId);
    this.events.publish(workOrder.pullDomainEvents());
  }
}
