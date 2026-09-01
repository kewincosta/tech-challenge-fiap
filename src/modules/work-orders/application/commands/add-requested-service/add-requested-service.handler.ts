import { Inject } from '@nestjs/common';
import { CommandHandler, EventBus, ICommandHandler, QueryBus } from '@nestjs/cqrs';
import { CLOCK, Clock } from '../../../../../shared/application/ports/clock.port';
import {
  ID_GENERATOR,
  IdGenerator,
} from '../../../../../shared/application/ports/id-generator.port';
import { Money } from '../../../../../shared/domain/value-objects/money';
import { ServiceSummaryDto } from '../../../../services/application/ports/service-query.port';
import { GetServiceQuery } from '../../../../services/application/queries/get-service/get-service.query';
import { ReferencedServiceNotFoundError } from '../../../domain/errors/referenced-service-not-found.error';
import { ServiceInactiveError } from '../../../domain/errors/service-inactive.error';
import { WorkOrderNotFoundError } from '../../../domain/errors/work-order-not-found.error';
import {
  WORK_ORDER_REPOSITORY,
  WorkOrderRepository,
} from '../../../domain/repositories/work-order.repository';
import { WorkOrderItemId } from '../../../domain/value-objects/work-order-item-id';
import { WorkOrderNumber } from '../../../domain/value-objects/work-order-number';
import { AddRequestedServiceCommand } from './add-requested-service.command';

const ACTIVE_STATUS = 'ACTIVE';

@CommandHandler(AddRequestedServiceCommand)
export class AddRequestedServiceHandler implements ICommandHandler<
  AddRequestedServiceCommand,
  void
> {
  constructor(
    @Inject(WORK_ORDER_REPOSITORY) private readonly workOrders: WorkOrderRepository,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly queryBus: QueryBus,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: AddRequestedServiceCommand): Promise<void> {
    const workOrder = await this.workOrders.findByNumber(
      WorkOrderNumber.create(command.workOrderNumber),
    );
    if (!workOrder) {
      throw new WorkOrderNotFoundError();
    }

    const service = await this.queryBus.execute<GetServiceQuery, ServiceSummaryDto | null>(
      new GetServiceQuery(command.serviceId),
    );
    if (!service) {
      throw new ReferencedServiceNotFoundError();
    }
    if (service.status !== ACTIVE_STATUS) {
      throw new ServiceInactiveError();
    }

    workOrder.addService({
      itemId: WorkOrderItemId.create(this.idGenerator.generate()),
      serviceId: command.serviceId,
      serviceName: service.name,
      unitPrice: Money.fromCents(service.priceCents),
      actorUserId: command.actorUserId,
      now: this.clock.now(),
    });
    await this.workOrders.save(workOrder);
    this.eventBus.publishAll(workOrder.pullDomainEvents());
  }
}
