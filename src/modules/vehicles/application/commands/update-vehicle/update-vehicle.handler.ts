import { Inject } from '@nestjs/common';
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs';
import { CLOCK } from '../../../../../shared/shared.tokens';
import { Clock } from '../../../../../shared/application/ports/clock.port';
import { OwningCustomerInactiveError } from '../../../domain/errors/owning-customer-inactive.error';
import { ReferencedCustomerNotFoundError } from '../../../domain/errors/referenced-customer-not-found.error';
import { VehicleNotFoundError } from '../../../domain/errors/vehicle-not-found.error';
import {
  VEHICLE_REPOSITORY,
  VehicleRepository,
} from '../../../domain/repositories/vehicle.repository';
import { VehicleId } from '../../../domain/value-objects/vehicle-id';
import { VehicleYear } from '../../../domain/value-objects/vehicle-year';
import { VEHICLE_OWNERS } from '../../../vehicles.tokens';
import { VehicleOwners } from '../../ports/vehicle-owners.port';
import { UpdateVehicleCommand } from './update-vehicle.command';

@CommandHandler(UpdateVehicleCommand)
export class UpdateVehicleHandler implements ICommandHandler<UpdateVehicleCommand, void> {
  constructor(
    @Inject(VEHICLE_REPOSITORY) private readonly vehicles: VehicleRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(VEHICLE_OWNERS) private readonly owners: VehicleOwners,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: UpdateVehicleCommand): Promise<void> {
    const vehicle = await this.vehicles.findById(VehicleId.create(command.vehicleId));
    if (!vehicle) {
      throw new VehicleNotFoundError();
    }

    const now = this.clock.now();
    const year =
      command.year !== undefined ? VehicleYear.create(command.year, now.getFullYear()) : undefined;
    vehicle.updateDetails({ brand: command.brand, model: command.model, year }, now);

    if (command.customerId !== undefined) {
      const owner = await this.owners.findById(command.customerId);
      if (!owner) {
        throw new ReferencedCustomerNotFoundError();
      }
      if (!owner.active) {
        throw new OwningCustomerInactiveError();
      }
      vehicle.transferTo(command.customerId, now);
    }

    await this.vehicles.save(vehicle);
    this.eventBus.publishAll(vehicle.pullDomainEvents());
  }
}
