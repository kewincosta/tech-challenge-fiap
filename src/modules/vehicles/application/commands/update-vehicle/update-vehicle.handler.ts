import { Inject } from '@nestjs/common';
import { CommandHandler, EventBus, ICommandHandler, QueryBus } from '@nestjs/cqrs';
import { CLOCK, Clock } from '../../../../../shared/application/ports/clock.port';
import { CustomerSummaryDto } from '../../../../customers/application/ports/customer-query.port';
import { GetCustomerQuery } from '../../../../customers/application/queries/get-customer/get-customer.query';
import { OwningCustomerInactiveError } from '../../../domain/errors/owning-customer-inactive.error';
import { ReferencedCustomerNotFoundError } from '../../../domain/errors/referenced-customer-not-found.error';
import { VehicleNotFoundError } from '../../../domain/errors/vehicle-not-found.error';
import { VEHICLE_REPOSITORY, VehicleRepository } from '../../../domain/repositories/vehicle.repository';
import { VehicleId } from '../../../domain/value-objects/vehicle-id';
import { VehicleYear } from '../../../domain/value-objects/vehicle-year';
import { UpdateVehicleCommand } from './update-vehicle.command';

const ACTIVE_STATUS = 'ACTIVE';

@CommandHandler(UpdateVehicleCommand)
export class UpdateVehicleHandler implements ICommandHandler<UpdateVehicleCommand, void> {
  constructor(
    @Inject(VEHICLE_REPOSITORY) private readonly vehicles: VehicleRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly queryBus: QueryBus,
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
      const customer = await this.queryBus.execute<GetCustomerQuery, CustomerSummaryDto | null>(
        new GetCustomerQuery(command.customerId),
      );
      if (!customer) {
        throw new ReferencedCustomerNotFoundError();
      }
      if (customer.status !== ACTIVE_STATUS) {
        throw new OwningCustomerInactiveError();
      }
      vehicle.transferTo(command.customerId, now);
    }

    await this.vehicles.save(vehicle);
    this.eventBus.publishAll(vehicle.pullDomainEvents());
  }
}
