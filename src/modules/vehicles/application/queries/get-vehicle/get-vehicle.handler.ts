import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { VEHICLE_QUERY_PORT, VehicleQueryPort, VehicleSummaryDto } from '../../ports/vehicle-query.port';
import { VehicleId } from '../../../domain/value-objects/vehicle-id';
import { GetVehicleQuery } from './get-vehicle.query';

@QueryHandler(GetVehicleQuery)
export class GetVehicleHandler implements IQueryHandler<GetVehicleQuery, VehicleSummaryDto | null> {
  constructor(@Inject(VEHICLE_QUERY_PORT) private readonly vehicleQuery: VehicleQueryPort) {}

  async execute(query: GetVehicleQuery): Promise<VehicleSummaryDto | null> {
    try {
      VehicleId.create(query.vehicleId);
    } catch {
      return null;
    }
    return this.vehicleQuery.getById(query.vehicleId);
  }
}
