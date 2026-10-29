import { Clock } from '../../../../../shared/application/ports/clock.port';
import { DomainEventPublisher } from '../../../../../shared/application/ports/domain-event-publisher.port';
import { IdGenerator } from '../../../../../shared/application/ports/id-generator.port';
import { Money } from '../../../../../shared/domain/value-objects/money';
import { ReferencedServiceNotFoundError } from '../../../domain/errors/referenced-service-not-found.error';
import { ServiceInactiveError } from '../../../domain/errors/service-inactive.error';
import { WorkOrderNotFoundError } from '../../../domain/errors/work-order-not-found.error';
import { ServiceCatalog } from '../../ports/service-catalog.port';
import { WorkOrderRepository } from '../../ports/work-order.repository';
import { WorkOrderItemId } from '../../../domain/value-objects/work-order-item-id';
import { WorkOrderNumber } from '../../../domain/value-objects/work-order-number';
import { AddRequestedServiceCommand } from './add-requested-service.command';

export class AddRequestedServiceHandler {
  constructor(
    private readonly workOrders: WorkOrderRepository,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
    private readonly serviceCatalog: ServiceCatalog,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(command: AddRequestedServiceCommand): Promise<void> {
    const workOrder = await this.workOrders.findByNumber(
      WorkOrderNumber.create(command.workOrderNumber),
    );
    if (!workOrder) {
      throw new WorkOrderNotFoundError();
    }

    const service = await this.serviceCatalog.findById(command.serviceId);
    if (!service) {
      throw new ReferencedServiceNotFoundError();
    }
    if (!service.active) {
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
    this.events.publish(workOrder.pullDomainEvents());
  }
}
