import { Inject } from '@nestjs/common';
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs';
import { CLOCK, Clock } from '../../../../../shared/application/ports/clock.port';
import { ServiceNotFoundError } from '../../../domain/errors/service-not-found.error';
import {
  SERVICE_REPOSITORY,
  ServiceRepository,
} from '../../../domain/repositories/service.repository';
import { ServiceId } from '../../../domain/value-objects/service-id';
import { DeactivateServiceCommand } from './deactivate-service.command';

@CommandHandler(DeactivateServiceCommand)
export class DeactivateServiceHandler implements ICommandHandler<DeactivateServiceCommand, void> {
  constructor(
    @Inject(SERVICE_REPOSITORY) private readonly services: ServiceRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: DeactivateServiceCommand): Promise<void> {
    const service = await this.services.findById(ServiceId.create(command.serviceId));
    if (!service) {
      throw new ServiceNotFoundError();
    }
    service.deactivate(this.clock.now());
    await this.services.save(service);
    this.eventBus.publishAll(service.pullDomainEvents());
  }
}
