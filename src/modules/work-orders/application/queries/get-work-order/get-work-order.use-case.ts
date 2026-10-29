import { WorkOrderNotFoundError } from '../../../domain/errors/work-order-not-found.error';
import { WorkOrderNumber } from '../../../domain/value-objects/work-order-number';
import { WorkOrderQueryPort, WorkOrderSummaryDto } from '../../ports/work-order-query.port';
import { GetWorkOrderQuery } from './get-work-order.query';

export class GetWorkOrderUseCase {
  constructor(private readonly workOrderQuery: WorkOrderQueryPort) {}

  async execute(query: GetWorkOrderQuery): Promise<WorkOrderSummaryDto> {
    // Deliberately left to throw, unlike GetServiceUseCase's malformed-id guard: a service or
    // inventory id is always a uuid, already rejected by ParseUUIDPipe before the use case runs,
    // so that guard only fires defensively. A work order number carries no such pipe. The value
    // object itself answers 400 for a malformed one (design.md's Error Handling), and only a
    // well-formed number with no match is refused as not found.
    WorkOrderNumber.create(query.number);
    const workOrder = await this.workOrderQuery.getByNumber(query.number);
    if (!workOrder) {
      throw new WorkOrderNotFoundError();
    }
    return workOrder;
  }
}
