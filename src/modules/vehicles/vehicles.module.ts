import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Clock } from '../../shared/application/ports/clock.port';
import { DomainEventPublisher } from '../../shared/application/ports/domain-event-publisher.port';
import { IdGenerator } from '../../shared/application/ports/id-generator.port';
import { CLOCK, DOMAIN_EVENT_PUBLISHER, ID_GENERATOR } from '../../shared/shared.tokens';
import { CustomersModule } from '../customers';
import { RegisterVehicleUseCase } from './application/commands/register-vehicle/register-vehicle.use-case';
import { RemoveVehicleUseCase } from './application/commands/remove-vehicle/remove-vehicle.use-case';
import { UpdateVehicleUseCase } from './application/commands/update-vehicle/update-vehicle.use-case';
import { VehicleOwners } from './application/ports/vehicle-owners.port';
import { VehicleQueryPort } from './application/ports/vehicle-query.port';
import { VehicleRepository } from './application/ports/vehicle.repository';
import { GetMyVehiclesUseCase } from './application/queries/get-my-vehicles/get-my-vehicles.use-case';
import { GetVehicleUseCase } from './application/queries/get-vehicle/get-vehicle.use-case';
import { ListVehiclesByCustomerUseCase } from './application/queries/list-vehicles-by-customer/list-vehicles-by-customer.use-case';
import { VehicleOwnersGateway } from './infrastructure/gateways/vehicle-owners.gateway';
import { TypeOrmVehicleQueryAdapter } from './infrastructure/persistence/typeorm-vehicle-query.adapter';
import { TypeOrmVehicleRepository } from './infrastructure/persistence/typeorm-vehicle.repository';
import { VehicleKeyResolver } from './infrastructure/persistence/vehicle-key-resolver';
import { VehicleOrmEntity } from './infrastructure/persistence/vehicle.orm-entity';
import { VehiclesController } from './presentation/controllers/vehicles.controller';
import { VEHICLE_OWNERS, VEHICLE_QUERY_PORT, VEHICLE_REPOSITORY } from './vehicles.tokens';

@Module({
  imports: [TypeOrmModule.forFeature([VehicleOrmEntity]), CustomersModule],
  controllers: [VehiclesController],
  providers: [
    {
      provide: RegisterVehicleUseCase,
      useFactory: (
        vehicles: VehicleRepository,
        idGenerator: IdGenerator,
        clock: Clock,
        owners: VehicleOwners,
        events: DomainEventPublisher,
      ) => new RegisterVehicleUseCase(vehicles, idGenerator, clock, owners, events),
      inject: [VEHICLE_REPOSITORY, ID_GENERATOR, CLOCK, VEHICLE_OWNERS, DOMAIN_EVENT_PUBLISHER],
    },
    {
      provide: UpdateVehicleUseCase,
      useFactory: (
        vehicles: VehicleRepository,
        clock: Clock,
        owners: VehicleOwners,
        events: DomainEventPublisher,
      ) => new UpdateVehicleUseCase(vehicles, clock, owners, events),
      inject: [VEHICLE_REPOSITORY, CLOCK, VEHICLE_OWNERS, DOMAIN_EVENT_PUBLISHER],
    },
    {
      provide: RemoveVehicleUseCase,
      useFactory: (vehicles: VehicleRepository, clock: Clock, events: DomainEventPublisher) =>
        new RemoveVehicleUseCase(vehicles, clock, events),
      inject: [VEHICLE_REPOSITORY, CLOCK, DOMAIN_EVENT_PUBLISHER],
    },
    {
      provide: GetVehicleUseCase,
      useFactory: (vehicleQuery: VehicleQueryPort) => new GetVehicleUseCase(vehicleQuery),
      inject: [VEHICLE_QUERY_PORT],
    },
    {
      provide: ListVehiclesByCustomerUseCase,
      useFactory: (vehicleQuery: VehicleQueryPort) =>
        new ListVehiclesByCustomerUseCase(vehicleQuery),
      inject: [VEHICLE_QUERY_PORT],
    },
    {
      provide: GetMyVehiclesUseCase,
      useFactory: (vehicleQuery: VehicleQueryPort, owners: VehicleOwners) =>
        new GetMyVehiclesUseCase(vehicleQuery, owners),
      inject: [VEHICLE_QUERY_PORT, VEHICLE_OWNERS],
    },
    { provide: VEHICLE_REPOSITORY, useClass: TypeOrmVehicleRepository },
    { provide: VEHICLE_QUERY_PORT, useClass: TypeOrmVehicleQueryAdapter },
    { provide: VEHICLE_OWNERS, useClass: VehicleOwnersGateway },
    VehicleKeyResolver,
  ],
  exports: [GetVehicleUseCase, VehicleKeyResolver],
})
export class VehiclesModule {}
