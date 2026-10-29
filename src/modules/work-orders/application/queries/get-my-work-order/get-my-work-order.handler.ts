import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { WorkOrderNumber } from '../../../domain/value-objects/work-order-number';
import { CustomerDirectory } from '../../ports/customer-directory.port';
import { WorkOrderQueryPort, WorkOrderSummaryDto } from '../../ports/work-order-query.port';
import { CUSTOMER_DIRECTORY, WORK_ORDER_QUERY_PORT } from '../../../work-orders.tokens';
import { GetMyWorkOrderQuery } from './get-my-work-order.query';

/**
 * One `null` for every reason the caller may not have this work order - no customer record, no
 * work order carrying the number, or a work order belonging to somebody else - so nothing
 * downstream can tell the three apart (design.md's Tech Decisions, mirroring
 * `BudgetDecisionAuthorizer`'s reasoning for answering not-found rather than forbidden).
 */
@QueryHandler(GetMyWorkOrderQuery)
export class GetMyWorkOrderHandler implements IQueryHandler<
  GetMyWorkOrderQuery,
  WorkOrderSummaryDto | null
> {
  constructor(
    @Inject(WORK_ORDER_QUERY_PORT) private readonly workOrderQuery: WorkOrderQueryPort,
    @Inject(CUSTOMER_DIRECTORY) private readonly customers: CustomerDirectory,
  ) {}

  async execute(query: GetMyWorkOrderQuery): Promise<WorkOrderSummaryDto | null> {
    // Malformed numbers answer 400, the same as every other number-bearing route - left to throw
    // before any read happens (GetWorkOrderHandler's own reasoning).
    WorkOrderNumber.create(query.number);

    const customer = await this.customers.findByUserId(query.userId);
    if (!customer) {
      return null;
    }

    const workOrder = await this.workOrderQuery.getByNumber(query.number);
    if (!workOrder || workOrder.customerId !== customer.id) {
      return null;
    }
    return workOrder;
  }
}
