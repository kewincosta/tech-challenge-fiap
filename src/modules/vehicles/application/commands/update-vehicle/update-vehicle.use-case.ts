import { Clock } from '../../../../../shared/application/ports/clock.port';
import { DomainEventPublisher } from '../../../../../shared/application/ports/domain-event-publisher.port';
import { OwningCustomerInactiveError } from '../../../domain/errors/owning-customer-inactive.error';
import { ReferencedCustomerNotFoundError } from '../../../domain/errors/referenced-customer-not-found.error';
import { VehicleNotFoundError } from '../../../domain/errors/vehicle-not-found.error';
import { VehicleId } from '../../../domain/value-objects/vehicle-id';
import { VehicleYear } from '../../../domain/value-objects/vehicle-year';
import { VehicleOwners } from '../../ports/vehicle-owners.port';
import { VehicleRepository } from '../../ports/vehicle.repository';
import { UpdateVehicleCommand } from './update-vehicle.command';

export class UpdateVehicleUseCase {
  constructor(
    private readonly vehicles: VehicleRepository,
    private readonly clock: Clock,
    private readonly owners: VehicleOwners,
    private readonly events: DomainEventPublisher,
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
    this.events.publish(vehicle.pullDomainEvents());
  }
}
