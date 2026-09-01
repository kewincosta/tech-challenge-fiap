import { Inject } from '@nestjs/common';
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs';
import { CLOCK, Clock } from '../../../../../shared/application/ports/clock.port';
import { WorkOrderNotFoundError } from '../../../domain/errors/work-order-not-found.error';
import {
  WORK_ORDER_REPOSITORY,
  WorkOrderRepository,
} from '../../../domain/repositories/work-order.repository';
import { WorkOrderNumber } from '../../../domain/value-objects/work-order-number';
import { StartDiagnosisCommand } from './start-diagnosis.command';

@CommandHandler(StartDiagnosisCommand)
export class StartDiagnosisHandler implements ICommandHandler<StartDiagnosisCommand, void> {
  constructor(
    @Inject(WORK_ORDER_REPOSITORY) private readonly workOrders: WorkOrderRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly eventBus: EventBus,
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
    this.eventBus.publishAll(workOrder.pullDomainEvents());
  }
}
