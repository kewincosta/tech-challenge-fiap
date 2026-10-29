import { VehicleNotFoundError } from '../../../domain/errors/vehicle-not-found.error';
import { VehicleId } from '../../../domain/value-objects/vehicle-id';
import { VehicleQueryPort, VehicleSummaryDto } from '../../ports/vehicle-query.port';
import { GetVehicleQuery } from './get-vehicle.query';

export class GetVehicleHandler {
  constructor(private readonly vehicleQuery: VehicleQueryPort) {}

  async execute(query: GetVehicleQuery): Promise<VehicleSummaryDto> {
    try {
      VehicleId.create(query.vehicleId);
    } catch {
      // A malformed id matches nothing by construction, and a uuid column would throw on it.
      throw new VehicleNotFoundError();
    }
    const vehicle = await this.vehicleQuery.getById(query.vehicleId);
    if (!vehicle) {
      throw new VehicleNotFoundError();
    }
    return vehicle;
  }
}
