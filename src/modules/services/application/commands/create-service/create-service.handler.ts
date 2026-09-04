import { Inject } from '@nestjs/common';
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs';
import { CLOCK, Clock } from '../../../../../shared/application/ports/clock.port';
import {
  ID_GENERATOR,
  IdGenerator,
} from '../../../../../shared/application/ports/id-generator.port';
import { Money } from '../../../../../shared/domain/value-objects/money';
import { Service } from '../../../domain/entities/service';
import { ServiceNameAlreadyInUseError } from '../../../domain/errors/service-name-already-in-use.error';
import {
  SERVICE_REPOSITORY,
  ServiceRepository,
} from '../../../domain/repositories/service.repository';
import { ServiceDuration } from '../../../domain/value-objects/service-duration';
import { ServiceId } from '../../../domain/value-objects/service-id';
import { ServiceName } from '../../../domain/value-objects/service-name';
import { CreatedServiceDto, CreateServiceCommand } from './create-service.command';

@CommandHandler(CreateServiceCommand)
export class CreateServiceHandler implements ICommandHandler<
  CreateServiceCommand,
  CreatedServiceDto
> {
  constructor(
    @Inject(SERVICE_REPOSITORY) private readonly services: ServiceRepository,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: CreateServiceCommand): Promise<CreatedServiceDto> {
    // Each of these throws its own Validation error: a negative price is refused by the shared
    // kernel's Money, so this module defines no price error of its own (design.md's reuse table).
    const name = ServiceName.create(command.name);
    const price = Money.fromCents(command.priceCents);
    const duration = ServiceDuration.fromMinutes(command.estimatedDurationMinutes);

    // Application-layer pre-check for the friendly 409, with the unique index as the race
    // backstop - the same two-layer shape RegisterCustomerHandler uses.
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
    this.eventBus.publishAll(service.pullDomainEvents());

    return { id: service.id.value };
  }
}
