import { CustomerDirectory } from '../../ports/customer-directory.port';
import { WorkOrderQueryPort, WorkOrderSummaryDto } from '../../ports/work-order-query.port';
import { GetMyWorkOrdersQuery } from './get-my-work-orders.query';

/** `GetMyVehiclesUseCase`'s exact shape: resolve the customer, empty list when there is none. */
export class GetMyWorkOrdersHandler {
  constructor(
    private readonly workOrderQuery: WorkOrderQueryPort,
    private readonly customers: CustomerDirectory,
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
