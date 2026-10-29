import { Inject } from '@nestjs/common';
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs';
import { CLOCK, ID_GENERATOR } from '../../../../../shared/shared.tokens';
import { Clock } from '../../../../../shared/application/ports/clock.port';
import { IdGenerator } from '../../../../../shared/application/ports/id-generator.port';
import { Vehicle } from '../../../domain/entities/vehicle';
import { OwningCustomerInactiveError } from '../../../domain/errors/owning-customer-inactive.error';
import { ReferencedCustomerNotFoundError } from '../../../domain/errors/referenced-customer-not-found.error';
import {
  VEHICLE_REPOSITORY,
  VehicleRepository,
} from '../../../domain/repositories/vehicle.repository';
import { LicensePlate } from '../../../domain/value-objects/license-plate';
import { VehicleId } from '../../../domain/value-objects/vehicle-id';
import { VehicleYear } from '../../../domain/value-objects/vehicle-year';
import { VEHICLE_OWNERS } from '../../../vehicles.tokens';
import { VehicleOwners } from '../../ports/vehicle-owners.port';
import { RegisteredVehicleDto, RegisterVehicleCommand } from './register-vehicle.command';

@CommandHandler(RegisterVehicleCommand)
export class RegisterVehicleHandler implements ICommandHandler<
  RegisterVehicleCommand,
  RegisteredVehicleDto
> {
  constructor(
    @Inject(VEHICLE_REPOSITORY) private readonly vehicles: VehicleRepository,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(VEHICLE_OWNERS) private readonly owners: VehicleOwners,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: RegisterVehicleCommand): Promise<RegisteredVehicleDto> {
    const owner = await this.owners.findById(command.customerId);
    if (!owner) {
      throw new ReferencedCustomerNotFoundError();
    }
    if (!owner.active) {
      throw new OwningCustomerInactiveError();
    }

    const now = this.clock.now();
    const vehicle = Vehicle.register({
      id: VehicleId.create(this.idGenerator.generate()),
      customerId: command.customerId,
      plate: LicensePlate.create(command.plate),
      brand: command.brand,
      model: command.model,
      year: VehicleYear.create(command.year, now.getFullYear()),
      now,
    });
    await this.vehicles.save(vehicle);
    this.eventBus.publishAll(vehicle.pullDomainEvents());

    return { id: vehicle.id.value };
  }
}
