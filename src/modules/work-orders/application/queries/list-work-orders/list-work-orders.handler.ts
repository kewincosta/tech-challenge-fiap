import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  WORK_ORDER_QUERY_PORT,
  WorkOrderQueryPort,
  WorkOrderSummaryDto,
} from '../../ports/work-order-query.port';
import { ListWorkOrdersQuery } from './list-work-orders.query';

@QueryHandler(ListWorkOrdersQuery)
export class ListWorkOrdersHandler implements IQueryHandler<
  ListWorkOrdersQuery,
  WorkOrderSummaryDto[]
> {
  constructor(@Inject(WORK_ORDER_QUERY_PORT) private readonly workOrderQuery: WorkOrderQueryPort) {}

  async execute(query: ListWorkOrdersQuery): Promise<WorkOrderSummaryDto[]> {
    return this.workOrderQuery.listByStatus(query.status);
  }
}
