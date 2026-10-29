import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { CustomerDirectory } from '../../ports/customer-directory.port';
import { WorkOrderQueryPort, WorkOrderSummaryDto } from '../../ports/work-order-query.port';
import { CUSTOMER_DIRECTORY, WORK_ORDER_QUERY_PORT } from '../../../work-orders.tokens';
import { GetMyWorkOrdersQuery } from './get-my-work-orders.query';

/** `GetMyVehiclesUseCase`'s exact shape: resolve the customer, empty list when there is none. */
@QueryHandler(GetMyWorkOrdersQuery)
export class GetMyWorkOrdersHandler implements IQueryHandler<
  GetMyWorkOrdersQuery,
  WorkOrderSummaryDto[]
> {
  constructor(
    @Inject(WORK_ORDER_QUERY_PORT) private readonly workOrderQuery: WorkOrderQueryPort,
    @Inject(CUSTOMER_DIRECTORY) private readonly customers: CustomerDirectory,
  ) {}

  async execute(query: GetMyWorkOrdersQuery): Promise<WorkOrderSummaryDto[]> {
    const customer = await this.customers.findByUserId(query.userId);
    // No customer record for this user - empty list, not an error (TAM-01's first edge case).
    if (!customer) {
      return [];
    }
    return this.workOrderQuery.listByCustomerId(customer.id);
  }
}
