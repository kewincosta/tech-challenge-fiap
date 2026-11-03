import { Clock } from '../../../../../shared/application/ports/clock.port';
import { DomainEventPublisher } from '../../../../../shared/application/ports/domain-event-publisher.port';
import { IdGenerator } from '../../../../../shared/application/ports/id-generator.port';
import { TransactionRunner } from '../../../../../shared/application/ports/transaction-runner.port';
import { WorkOrderNotFoundError } from '../../../domain/errors/work-order-not-found.error';
import { PendingStockSteps, StockStep, StockStepKind } from '../../ports/pending-stock-steps.port';
import { WorkOrderRepository } from '../../ports/work-order.repository';
import { StockStepApplier } from '../../services/stock-step-applier';
import { WorkOrderNumber } from '../../../domain/value-objects/work-order-number';
import { DeliverVehicleCommand } from './deliver-vehicle.command';

/**
 * A delivery saves the work order and records a settle step in the work-orders outbox in one
 * transaction, then applies the step once that transaction has committed (CA-10), the shape of
 * `ReturnPartsUseCase`. The aggregate validates the transition purely in memory first, so a refused
 * delivery writes nothing. Inventory settles the work order's pending consumptions in a
 * transaction of its own, and settles nothing when there are none. When that attempt fails the
 * request still succeeds with the work order it saved, and the processor retries the step.
 */
export class DeliverVehicleUseCase {
  constructor(
    private readonly workOrders: WorkOrderRepository,
    private readonly transactionRunner: TransactionRunner,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
    private readonly steps: PendingStockSteps,
    private readonly applier: StockStepApplier,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(command: DeliverVehicleCommand): Promise<void> {
    const workOrder = await this.workOrders.findByNumber(
      WorkOrderNumber.create(command.workOrderNumber),
    );
    if (!workOrder) {
      throw new WorkOrderNotFoundError();
    }

    workOrder.deliver({ actorUserId: command.actorUserId, now: this.clock.now() });

    const step: StockStep = {
      operationId: this.idGenerator.generate(),
      kind: StockStepKind.Settle,
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
