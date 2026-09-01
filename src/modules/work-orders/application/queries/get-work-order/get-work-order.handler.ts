import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { WorkOrderNumber } from '../../../domain/value-objects/work-order-number';
import {
  WORK_ORDER_QUERY_PORT,
  WorkOrderQueryPort,
  WorkOrderSummaryDto,
} from '../../ports/work-order-query.port';
import { GetWorkOrderQuery } from './get-work-order.query';

@QueryHandler(GetWorkOrderQuery)
export class GetWorkOrderHandler implements IQueryHandler<
  GetWorkOrderQuery,
  WorkOrderSummaryDto | null
> {
  constructor(@Inject(WORK_ORDER_QUERY_PORT) private readonly workOrderQuery: WorkOrderQueryPort) {}

  async execute(query: GetWorkOrderQuery): Promise<WorkOrderSummaryDto | null> {
    try {
      WorkOrderNumber.create(query.number);
    } catch {
      // A malformed number matches nothing by construction - same guard GetServiceHandler uses.
      return null;
    }
    return this.workOrderQuery.getByNumber(query.number);
  }
}
