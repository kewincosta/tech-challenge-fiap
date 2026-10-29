import { WorkOrderQueryPort, WorkOrderSummaryDto } from '../../ports/work-order-query.port';
import { ListWorkOrdersQuery } from './list-work-orders.query';

export class ListWorkOrdersUseCase {
  constructor(private readonly workOrderQuery: WorkOrderQueryPort) {}

  async execute(query: ListWorkOrdersQuery): Promise<WorkOrderSummaryDto[]> {
    return this.workOrderQuery.listByStatus(query.status);
  }
}
