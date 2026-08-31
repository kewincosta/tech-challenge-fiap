import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { VEHICLE_QUERY_PORT, VehicleQueryPort, VehicleSummaryDto } from '../../ports/vehicle-query.port';
import { ListVehiclesByCustomerQuery } from './list-vehicles-by-customer.query';

@QueryHandler(ListVehiclesByCustomerQuery)
export class ListVehiclesByCustomerHandler
  implements IQueryHandler<ListVehiclesByCustomerQuery, VehicleSummaryDto[]>
{
  constructor(@Inject(VEHICLE_QUERY_PORT) private readonly vehicleQuery: VehicleQueryPort) {}

  async execute(query: ListVehiclesByCustomerQuery): Promise<VehicleSummaryDto[]> {
    return this.vehicleQuery.listByCustomerId(query.customerId);
  }
}
