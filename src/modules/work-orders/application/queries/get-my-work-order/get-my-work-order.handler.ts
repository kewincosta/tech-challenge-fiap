import { WorkOrderNotFoundError } from '../../../domain/errors/work-order-not-found.error';
import { WorkOrderNumber } from '../../../domain/value-objects/work-order-number';
import { CustomerDirectory } from '../../ports/customer-directory.port';
import { WorkOrderQueryPort, WorkOrderSummaryDto } from '../../ports/work-order-query.port';
import { GetMyWorkOrderQuery } from './get-my-work-order.query';

/**
 * One not-found error for every reason the caller may not have this work order: no customer
 * record, no work order carrying the number, or a work order belonging to somebody else. Nothing
 * downstream can tell the three apart (design.md's Tech Decisions, mirroring
 * `BudgetDecisionAuthorizer`'s reasoning for answering not-found rather than forbidden).
 */
export class GetMyWorkOrderHandler {
  constructor(
    private readonly workOrderQuery: WorkOrderQueryPort,
    private readonly customers: CustomerDirectory,
  ) {}

  async execute(query: GetMyWorkOrderQuery): Promise<WorkOrderSummaryDto> {
    // Malformed numbers answer 400, the same as every other number-bearing route. Left to throw
    // before any read happens (GetWorkOrderHandler's own reasoning).
    WorkOrderNumber.create(query.number);

    const customer = await this.customers.findByUserId(query.userId);
    if (!customer) {
      throw new WorkOrderNotFoundError();
    }

    const workOrder = await this.workOrderQuery.getByNumber(query.number);
    if (!workOrder || workOrder.customerId !== customer.id) {
      throw new WorkOrderNotFoundError();
    }
    return workOrder;
  }
}
