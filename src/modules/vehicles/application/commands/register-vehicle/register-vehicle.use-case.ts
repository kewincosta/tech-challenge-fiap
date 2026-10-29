import { Clock } from '../../../../../shared/application/ports/clock.port';
import { DomainEventPublisher } from '../../../../../shared/application/ports/domain-event-publisher.port';
import { IdGenerator } from '../../../../../shared/application/ports/id-generator.port';
import { Vehicle } from '../../../domain/entities/vehicle';
import { OwningCustomerInactiveError } from '../../../domain/errors/owning-customer-inactive.error';
import { ReferencedCustomerNotFoundError } from '../../../domain/errors/referenced-customer-not-found.error';
import { LicensePlate } from '../../../domain/value-objects/license-plate';
import { VehicleId } from '../../../domain/value-objects/vehicle-id';
import { VehicleYear } from '../../../domain/value-objects/vehicle-year';
import { VehicleOwners } from '../../ports/vehicle-owners.port';
import { VehicleRepository } from '../../ports/vehicle.repository';
import { RegisteredVehicleDto, RegisterVehicleCommand } from './register-vehicle.command';

export class RegisterVehicleUseCase {
  constructor(
    private readonly vehicles: VehicleRepository,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
    private readonly owners: VehicleOwners,
    private readonly events: DomainEventPublisher,
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
    this.events.publish(vehicle.pullDomainEvents());

    return { id: vehicle.id.value };
  }
}
