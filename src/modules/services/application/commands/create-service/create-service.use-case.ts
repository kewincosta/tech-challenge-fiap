import { Clock } from '../../../../../shared/application/ports/clock.port';
import { DomainEventPublisher } from '../../../../../shared/application/ports/domain-event-publisher.port';
import { IdGenerator } from '../../../../../shared/application/ports/id-generator.port';
import { Money } from '../../../../../shared/domain/value-objects/money';
import { Service } from '../../../domain/entities/service';
import { ServiceNameAlreadyInUseError } from '../../../domain/errors/service-name-already-in-use.error';
import { ServiceDuration } from '../../../domain/value-objects/service-duration';
import { ServiceId } from '../../../domain/value-objects/service-id';
import { ServiceName } from '../../../domain/value-objects/service-name';
import { ServiceRepository } from '../../ports/service.repository';
import { CreatedServiceDto, CreateServiceCommand } from './create-service.command';

export class CreateServiceUseCase {
  constructor(
    private readonly services: ServiceRepository,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(command: CreateServiceCommand): Promise<CreatedServiceDto> {
    // Each of these throws its own Validation error: a negative price is refused by the shared
    // kernel's Money, so this module defines no price error of its own (design.md's reuse table).
    const name = ServiceName.create(command.name);
    const price = Money.fromCents(command.priceCents);
    const duration = ServiceDuration.fromMinutes(command.estimatedDurationMinutes);

    // Application-layer pre-check for the friendly 409, with the unique index as the race
    // backstop - the same two-layer shape RegisterCustomerUseCase uses.
    if (await this.services.existsActiveByName(name)) {
      throw new ServiceNameAlreadyInUseError();
    }

    const service = Service.create({
      id: ServiceId.create(this.idGenerator.generate()),
      name,
      description: command.description,
      price,
      duration,
      now: this.clock.now(),
    });
    await this.services.save(service);
    this.events.publish(service.pullDomainEvents());

    return { id: service.id.value };
  }
}
