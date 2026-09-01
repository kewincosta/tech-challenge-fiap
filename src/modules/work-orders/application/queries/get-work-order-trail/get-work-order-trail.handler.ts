import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  WORK_ORDER_QUERY_PORT,
  WorkOrderQueryPort,
  WorkOrderTrailEntryDto,
} from '../../ports/work-order-query.port';
import { GetWorkOrderTrailQuery } from './get-work-order-trail.query';

/**
 * Whether the work order itself exists is not this handler's concern - the 404 for an unknown
 * number is owned by the controller, alongside `GetWorkOrderQuery` (T19), the same split T10
 * established for the inventory movement history.
 */
@QueryHandler(GetWorkOrderTrailQuery)
export class GetWorkOrderTrailHandler implements IQueryHandler<
  GetWorkOrderTrailQuery,
  WorkOrderTrailEntryDto[]
> {
  constructor(@Inject(WORK_ORDER_QUERY_PORT) private readonly workOrderQuery: WorkOrderQueryPort) {}

  async execute(query: GetWorkOrderTrailQuery): Promise<WorkOrderTrailEntryDto[]> {
    return this.workOrderQuery.listTrail(query.number);
  }
}
