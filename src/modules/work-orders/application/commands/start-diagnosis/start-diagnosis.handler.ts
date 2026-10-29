import { Clock } from '../../../../../shared/application/ports/clock.port';
import { DomainEventPublisher } from '../../../../../shared/application/ports/domain-event-publisher.port';
import { WorkOrderNotFoundError } from '../../../domain/errors/work-order-not-found.error';
import { WorkOrderRepository } from '../../ports/work-order.repository';
import { WorkOrderNumber } from '../../../domain/value-objects/work-order-number';
import { StartDiagnosisCommand } from './start-diagnosis.command';

export class StartDiagnosisHandler {
  constructor(
    private readonly workOrders: WorkOrderRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(command: StartDiagnosisCommand): Promise<void> {
    const workOrder = await this.workOrders.findByNumber(
      WorkOrderNumber.create(command.workOrderNumber),
    );
    if (!workOrder) {
      throw new WorkOrderNotFoundError();
    }

    workOrder.startDiagnosis({ actorUserId: command.actorUserId, now: this.clock.now() });
    await this.workOrders.save(workOrder);
    this.events.publish(workOrder.pullDomainEvents());
  }
}
