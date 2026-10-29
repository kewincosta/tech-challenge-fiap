import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { VEHICLE_OWNERS } from '../../../vehicles.tokens';
import { VehicleOwners } from '../../ports/vehicle-owners.port';
import {
  VEHICLE_QUERY_PORT,
  VehicleQueryPort,
  VehicleSummaryDto,
} from '../../ports/vehicle-query.port';
import { GetMyVehiclesQuery } from './get-my-vehicles.query';

@QueryHandler(GetMyVehiclesQuery)
export class GetMyVehiclesHandler implements IQueryHandler<
  GetMyVehiclesQuery,
  VehicleSummaryDto[]
> {
  constructor(
    @Inject(VEHICLE_QUERY_PORT) private readonly vehicleQuery: VehicleQueryPort,
    @Inject(VEHICLE_OWNERS) private readonly owners: VehicleOwners,
  ) {}

  async execute(query: GetMyVehiclesQuery): Promise<VehicleSummaryDto[]> {
    const owner = await this.owners.findByUserId(query.userId);
    // No customer record for this user - empty list, not an error (CVR-04 AC4).
    if (!owner) {
      return [];
    }
    return this.vehicleQuery.listByCustomerId(owner.id);
  }
}
