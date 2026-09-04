import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs';
import { CustomerSummaryDto } from '../../../../customers/application/ports/customer-query.port';
import { GetCustomerByUserIdQuery } from '../../../../customers/application/queries/get-customer-by-user-id/get-customer-by-user-id.query';
import {
  WORK_ORDER_QUERY_PORT,
  WorkOrderQueryPort,
  WorkOrderSummaryDto,
} from '../../ports/work-order-query.port';
import { GetMyWorkOrdersQuery } from './get-my-work-orders.query';

/** `GetMyVehiclesHandler`'s exact shape: resolve the customer, empty list when there is none. */
@QueryHandler(GetMyWorkOrdersQuery)
export class GetMyWorkOrdersHandler implements IQueryHandler<
  GetMyWorkOrdersQuery,
  WorkOrderSummaryDto[]
> {
  constructor(
    @Inject(WORK_ORDER_QUERY_PORT) private readonly workOrderQuery: WorkOrderQueryPort,
    private readonly queryBus: QueryBus,
  ) {}

  async execute(query: GetMyWorkOrdersQuery): Promise<WorkOrderSummaryDto[]> {
    const customer = await this.queryBus.execute<
      GetCustomerByUserIdQuery,
      CustomerSummaryDto | null
    >(new GetCustomerByUserIdQuery(query.userId));
    // No customer record for this user - empty list, not an error (TAM-01's first edge case).
    if (!customer) {
      return [];
    }
    return this.workOrderQuery.listByCustomerId(customer.id);
  }
}
