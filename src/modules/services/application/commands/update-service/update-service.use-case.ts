import { Clock } from '../../../../../shared/application/ports/clock.port';
import { DomainEventPublisher } from '../../../../../shared/application/ports/domain-event-publisher.port';
import { Money } from '../../../../../shared/domain/value-objects/money';
import { ServiceNameAlreadyInUseError } from '../../../domain/errors/service-name-already-in-use.error';
import { ServiceNotFoundError } from '../../../domain/errors/service-not-found.error';
import { ServiceDuration } from '../../../domain/value-objects/service-duration';
import { ServiceId } from '../../../domain/value-objects/service-id';
import { ServiceName } from '../../../domain/value-objects/service-name';
import { ServiceRepository } from '../../ports/service.repository';
import { UpdateServiceCommand } from './update-service.command';

export class UpdateServiceUseCase {
  constructor(
    private readonly services: ServiceRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(command: UpdateServiceCommand): Promise<void> {
    const serviceId = ServiceId.create(command.serviceId);
    const service = await this.services.findById(serviceId);
    if (!service) {
      throw new ServiceNotFoundError();
    }

    const name = command.name !== undefined ? ServiceName.create(command.name) : undefined;
    // Excludes this service's own row: renaming a service to the name it already holds is a no-op,
    // not a conflict (design.md's Risks & Concerns).
    if (name && (await this.services.existsActiveByName(name, serviceId))) {
      throw new ServiceNameAlreadyInUseError();
    }

    const price =
      command.priceCents !== undefined ? Money.fromCents(command.priceCents) : undefined;
    const duration =
      command.estimatedDurationMinutes !== undefined
        ? ServiceDuration.fromMinutes(command.estimatedDurationMinutes)
        : undefined;

    service.updateDetails(
      { name, description: command.description, price, duration },
      this.clock.now(),
    );
    await this.services.save(service);
    this.events.publish(service.pullDomainEvents());
  }
}
