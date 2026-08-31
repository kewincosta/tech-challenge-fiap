import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler, QueryBus } from '@nestjs/cqrs';
import { CustomerSummaryDto } from '../../../../customers/application/ports/customer-query.port';
import { GetCustomerByUserIdQuery } from '../../../../customers/application/queries/get-customer-by-user-id/get-customer-by-user-id.query';
import { VEHICLE_QUERY_PORT, VehicleQueryPort, VehicleSummaryDto } from '../../ports/vehicle-query.port';
import { GetMyVehiclesQuery } from './get-my-vehicles.query';

@QueryHandler(GetMyVehiclesQuery)
export class GetMyVehiclesHandler implements IQueryHandler<GetMyVehiclesQuery, VehicleSummaryDto[]> {
  constructor(
    @Inject(VEHICLE_QUERY_PORT) private readonly vehicleQuery: VehicleQueryPort,
    private readonly queryBus: QueryBus,
  ) {}

  async execute(query: GetMyVehiclesQuery): Promise<VehicleSummaryDto[]> {
    const customer = await this.queryBus.execute<GetCustomerByUserIdQuery, CustomerSummaryDto | null>(
      new GetCustomerByUserIdQuery(query.userId),
    );
    // No customer record for this user - empty list, not an error (CVR-04 AC4).
    if (!customer) {
      return [];
    }
    return this.vehicleQuery.listByCustomerId(customer.id);
  }
}
