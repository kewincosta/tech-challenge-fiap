import { VehicleOwners } from '../../ports/vehicle-owners.port';
import { VehicleQueryPort, VehicleSummaryDto } from '../../ports/vehicle-query.port';
import { GetMyVehiclesQuery } from './get-my-vehicles.query';

export class GetMyVehiclesHandler {
  constructor(
    private readonly vehicleQuery: VehicleQueryPort,
    private readonly owners: VehicleOwners,
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
