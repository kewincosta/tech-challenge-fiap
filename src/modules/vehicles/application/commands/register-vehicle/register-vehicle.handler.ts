import { Inject } from '@nestjs/common';
import { CommandHandler, EventBus, ICommandHandler, QueryBus } from '@nestjs/cqrs';
import { CLOCK, Clock } from '../../../../../shared/application/ports/clock.port';
import { ID_GENERATOR, IdGenerator } from '../../../../../shared/application/ports/id-generator.port';
import { CustomerSummaryDto } from '../../../../customers/application/ports/customer-query.port';
import { GetCustomerQuery } from '../../../../customers/application/queries/get-customer/get-customer.query';
import { Vehicle } from '../../../domain/entities/vehicle';
import { OwningCustomerInactiveError } from '../../../domain/errors/owning-customer-inactive.error';
import { ReferencedCustomerNotFoundError } from '../../../domain/errors/referenced-customer-not-found.error';
import { VEHICLE_REPOSITORY, VehicleRepository } from '../../../domain/repositories/vehicle.repository';
import { LicensePlate } from '../../../domain/value-objects/license-plate';
import { VehicleId } from '../../../domain/value-objects/vehicle-id';
import { VehicleYear } from '../../../domain/value-objects/vehicle-year';
import { RegisteredVehicleDto, RegisterVehicleCommand } from './register-vehicle.command';

const ACTIVE_STATUS = 'ACTIVE';

@CommandHandler(RegisterVehicleCommand)
export class RegisterVehicleHandler
  implements ICommandHandler<RegisterVehicleCommand, RegisteredVehicleDto>
{
  constructor(
    @Inject(VEHICLE_REPOSITORY) private readonly vehicles: VehicleRepository,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly queryBus: QueryBus,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: RegisterVehicleCommand): Promise<RegisteredVehicleDto> {
    const customer = await this.queryBus.execute<GetCustomerQuery, CustomerSummaryDto | null>(
      new GetCustomerQuery(command.customerId),
    );
    if (!customer) {
      throw new ReferencedCustomerNotFoundError();
    }
    if (customer.status !== ACTIVE_STATUS) {
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
