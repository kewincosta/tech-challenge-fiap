export { GetVehicleUseCase } from './application/queries/get-vehicle/get-vehicle.use-case';
export { GetVehicleQuery } from './application/queries/get-vehicle/get-vehicle.query';
export type { VehicleSummaryDto } from './application/ports/vehicle-query.port';
export { VehicleNotFoundError } from './domain/errors/vehicle-not-found.error';
export { VehicleKeyResolver } from './infrastructure/persistence/vehicle-key-resolver';
export { VehiclesModule } from './vehicles.module';
