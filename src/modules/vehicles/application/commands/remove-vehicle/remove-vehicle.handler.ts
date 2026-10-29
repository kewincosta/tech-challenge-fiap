import { Clock } from '../../../../../shared/application/ports/clock.port';
import { DomainEventPublisher } from '../../../../../shared/application/ports/domain-event-publisher.port';
import { VehicleNotFoundError } from '../../../domain/errors/vehicle-not-found.error';
import { VehicleId } from '../../../domain/value-objects/vehicle-id';
import { VehicleRepository } from '../../ports/vehicle.repository';
import { RemoveVehicleCommand } from './remove-vehicle.command';

export class RemoveVehicleHandler {
  constructor(
    private readonly vehicles: VehicleRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(command: RemoveVehicleCommand): Promise<void> {
    const vehicle = await this.vehicles.findById(VehicleId.create(command.vehicleId));
    if (!vehicle) {
      throw new VehicleNotFoundError();
    }
    vehicle.remove(this.clock.now());
    await this.vehicles.save(vehicle);
    this.events.publish(vehicle.pullDomainEvents());
  }
}
