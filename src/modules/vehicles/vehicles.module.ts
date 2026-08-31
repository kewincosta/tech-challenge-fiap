import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RegisterVehicleHandler } from './application/commands/register-vehicle/register-vehicle.handler';
import { RemoveVehicleHandler } from './application/commands/remove-vehicle/remove-vehicle.handler';
import { UpdateVehicleHandler } from './application/commands/update-vehicle/update-vehicle.handler';
import { VEHICLE_QUERY_PORT } from './application/ports/vehicle-query.port';
import { GetMyVehiclesHandler } from './application/queries/get-my-vehicles/get-my-vehicles.handler';
import { GetVehicleHandler } from './application/queries/get-vehicle/get-vehicle.handler';
import { ListVehiclesByCustomerHandler } from './application/queries/list-vehicles-by-customer/list-vehicles-by-customer.handler';
import { VEHICLE_REPOSITORY } from './domain/repositories/vehicle.repository';
import { TypeOrmVehicleQueryAdapter } from './infrastructure/persistence/typeorm-vehicle-query.adapter';
import { TypeOrmVehicleRepository } from './infrastructure/persistence/typeorm-vehicle.repository';
import { VehicleOrmEntity } from './infrastructure/persistence/vehicle.orm-entity';
import { VehiclesController } from './presentation/controllers/vehicles.controller';

@Module({
  imports: [TypeOrmModule.forFeature([VehicleOrmEntity])],
  controllers: [VehiclesController],
  providers: [
    RegisterVehicleHandler,
    UpdateVehicleHandler,
    RemoveVehicleHandler,
    GetVehicleHandler,
    ListVehiclesByCustomerHandler,
    GetMyVehiclesHandler,
    { provide: VEHICLE_REPOSITORY, useClass: TypeOrmVehicleRepository },
    { provide: VEHICLE_QUERY_PORT, useClass: TypeOrmVehicleQueryAdapter },
  ],
})
export class VehiclesModule {}
