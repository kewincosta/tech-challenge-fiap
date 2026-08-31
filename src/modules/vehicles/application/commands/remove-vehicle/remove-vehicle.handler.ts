import { Inject } from '@nestjs/common';
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs';
import { CLOCK, Clock } from '../../../../../shared/application/ports/clock.port';
import { VehicleNotFoundError } from '../../../domain/errors/vehicle-not-found.error';
import { VEHICLE_REPOSITORY, VehicleRepository } from '../../../domain/repositories/vehicle.repository';
import { VehicleId } from '../../../domain/value-objects/vehicle-id';
import { RemoveVehicleCommand } from './remove-vehicle.command';

@CommandHandler(RemoveVehicleCommand)
export class RemoveVehicleHandler implements ICommandHandler<RemoveVehicleCommand, void> {
  constructor(
    @Inject(VEHICLE_REPOSITORY) private readonly vehicles: VehicleRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: RemoveVehicleCommand): Promise<void> {
    const vehicle = await this.vehicles.findById(VehicleId.create(command.vehicleId));
    if (!vehicle) {
      throw new VehicleNotFoundError();
    }
    vehicle.remove(this.clock.now());
    await this.vehicles.save(vehicle);
    this.eventBus.publishAll(vehicle.pullDomainEvents());
  }
}
