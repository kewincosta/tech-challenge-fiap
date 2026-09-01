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
    // Deliberately left to throw, unlike GetServiceHandler's malformed-id guard: a service or
    // inventory id is always a uuid, already rejected by ParseUUIDPipe before the query runs, so
    // that guard only ever fires defensively. A work order number carries no such pipe - the
    // value object itself is what answers 400 for a malformed one (design.md's Error Handling),
    // and only a well-formed number with no match answers null here.
    WorkOrderNumber.create(query.number);
    return this.workOrderQuery.getByNumber(query.number);
  }
}
