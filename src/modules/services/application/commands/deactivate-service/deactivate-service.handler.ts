import { Clock } from '../../../../../shared/application/ports/clock.port';
import { DomainEventPublisher } from '../../../../../shared/application/ports/domain-event-publisher.port';
import { ServiceNotFoundError } from '../../../domain/errors/service-not-found.error';
import { ServiceId } from '../../../domain/value-objects/service-id';
import { ServiceRepository } from '../../ports/service.repository';
import { DeactivateServiceCommand } from './deactivate-service.command';

export class DeactivateServiceHandler {
  constructor(
    private readonly services: ServiceRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(command: DeactivateServiceCommand): Promise<void> {
    const service = await this.services.findById(ServiceId.create(command.serviceId));
    if (!service) {
      throw new ServiceNotFoundError();
    }
    service.deactivate(this.clock.now());
    await this.services.save(service);
    this.events.publish(service.pullDomainEvents());
  }
}
