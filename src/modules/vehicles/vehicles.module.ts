import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Clock } from '../../shared/application/ports/clock.port';
import { DomainEventPublisher } from '../../shared/application/ports/domain-event-publisher.port';
import { IdGenerator } from '../../shared/application/ports/id-generator.port';
import { CLOCK, DOMAIN_EVENT_PUBLISHER, ID_GENERATOR } from '../../shared/shared.tokens';
import { CustomersModule } from '../customers';
import { RegisterVehicleHandler } from './application/commands/register-vehicle/register-vehicle.handler';
import { RemoveVehicleHandler } from './application/commands/remove-vehicle/remove-vehicle.handler';
import { UpdateVehicleHandler } from './application/commands/update-vehicle/update-vehicle.handler';
import { VehicleOwners } from './application/ports/vehicle-owners.port';
import { VehicleQueryPort } from './application/ports/vehicle-query.port';
import { VehicleRepository } from './application/ports/vehicle.repository';
import { GetMyVehiclesHandler } from './application/queries/get-my-vehicles/get-my-vehicles.handler';
import { GetVehicleHandler } from './application/queries/get-vehicle/get-vehicle.handler';
import { ListVehiclesByCustomerHandler } from './application/queries/list-vehicles-by-customer/list-vehicles-by-customer.handler';
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
      provide: RegisterVehicleHandler,
      useFactory: (
        vehicles: VehicleRepository,
        idGenerator: IdGenerator,
        clock: Clock,
        owners: VehicleOwners,
        events: DomainEventPublisher,
      ) => new RegisterVehicleHandler(vehicles, idGenerator, clock, owners, events),
      inject: [VEHICLE_REPOSITORY, ID_GENERATOR, CLOCK, VEHICLE_OWNERS, DOMAIN_EVENT_PUBLISHER],
    },
    {
      provide: UpdateVehicleHandler,
      useFactory: (
        vehicles: VehicleRepository,
        clock: Clock,
        owners: VehicleOwners,
        events: DomainEventPublisher,
      ) => new UpdateVehicleHandler(vehicles, clock, owners, events),
      inject: [VEHICLE_REPOSITORY, CLOCK, VEHICLE_OWNERS, DOMAIN_EVENT_PUBLISHER],
    },
    {
      provide: RemoveVehicleHandler,
      useFactory: (vehicles: VehicleRepository, clock: Clock, events: DomainEventPublisher) =>
        new RemoveVehicleHandler(vehicles, clock, events),
      inject: [VEHICLE_REPOSITORY, CLOCK, DOMAIN_EVENT_PUBLISHER],
    },
    {
      provide: GetVehicleHandler,
      useFactory: (vehicleQuery: VehicleQueryPort) => new GetVehicleHandler(vehicleQuery),
      inject: [VEHICLE_QUERY_PORT],
    },
    {
      provide: ListVehiclesByCustomerHandler,
      useFactory: (vehicleQuery: VehicleQueryPort) =>
        new ListVehiclesByCustomerHandler(vehicleQuery),
      inject: [VEHICLE_QUERY_PORT],
    },
    {
      provide: GetMyVehiclesHandler,
      useFactory: (vehicleQuery: VehicleQueryPort, owners: VehicleOwners) =>
        new GetMyVehiclesHandler(vehicleQuery, owners),
      inject: [VEHICLE_QUERY_PORT, VEHICLE_OWNERS],
    },
    { provide: VEHICLE_REPOSITORY, useClass: TypeOrmVehicleRepository },
    { provide: VEHICLE_QUERY_PORT, useClass: TypeOrmVehicleQueryAdapter },
    { provide: VEHICLE_OWNERS, useClass: VehicleOwnersGateway },
    VehicleKeyResolver,
  ],
  exports: [GetVehicleHandler, VehicleKeyResolver],
})
export class VehiclesModule {}
