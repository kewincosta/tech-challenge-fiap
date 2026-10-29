import { Clock } from '../../../../../shared/application/ports/clock.port';
import { DomainEventPublisher } from '../../../../../shared/application/ports/domain-event-publisher.port';
import { TransactionRunner } from '../../../../../shared/application/ports/transaction-runner.port';
import { WorkOrderNotFoundError } from '../../../domain/errors/work-order-not-found.error';
import { StockLedger } from '../../ports/stock-ledger.port';
import { WorkOrderRepository } from '../../ports/work-order.repository';
import { WorkOrderNumber } from '../../../domain/value-objects/work-order-number';
import { CancellationAuthorizer } from '../../services/cancellation.authorizer';
import { CancelWorkOrderCommand } from './cancel-work-order.command';

/**
 * Owns the write that spans two modules (AD-008), `DeliverVehicleUseCase`'s shape, with the
 * authorizer running between the load and the aggregate call (`CompleteWorkOrderUseCase`'s
 * shape). Always asks the ledger to write off, even when the aggregate carries no outstanding
 * withdrawal: deciding whether there is anything to write off is the inventory side's own job,
 * not this use case's (spec.md's edge case: a work order that withdrew nothing cancels cleanly,
 * and the ledger simply writes off nothing).
 */
export class CancelWorkOrderUseCase {
  constructor(
    private readonly workOrders: WorkOrderRepository,
    private readonly transactionRunner: TransactionRunner,
    private readonly authorizer: CancellationAuthorizer,
    private readonly clock: Clock,
    private readonly stockLedger: StockLedger,
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

    await this.transactionRunner.run(async () => {
      await this.workOrders.save(workOrder);
      await this.stockLedger.writeOff(workOrder.id.value, command.actorUserId);
    });
    this.events.publish(workOrder.pullDomainEvents());
  }
}
