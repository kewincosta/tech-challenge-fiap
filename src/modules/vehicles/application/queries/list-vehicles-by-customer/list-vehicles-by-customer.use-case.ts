import { VehicleQueryPort, VehicleSummaryDto } from '../../ports/vehicle-query.port';
import { ListVehiclesByCustomerQuery } from './list-vehicles-by-customer.query';

export class ListVehiclesByCustomerUseCase {
  constructor(private readonly vehicleQuery: VehicleQueryPort) {}

  async execute(query: ListVehiclesByCustomerQuery): Promise<VehicleSummaryDto[]> {
    return this.vehicleQuery.listByCustomerId(query.customerId);
  }
}
