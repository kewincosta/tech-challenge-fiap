import { WorkOrderNotFoundError } from '../../../domain/errors/work-order-not-found.error';
import { WorkOrderNumber } from '../../../domain/value-objects/work-order-number';
import { WorkOrderQueryPort, WorkOrderTrailEntryDto } from '../../ports/work-order-query.port';
import { GetWorkOrderTrailQuery } from './get-work-order-trail.query';

/**
 * A number no work order carries is refused with the not-found error, never answered with an
 * empty trail, and a malformed number is refused with the number error before anything is read.
 * Both rules sit here, so any entry point inherits them, as with the inventory movement history.
 */
export class GetWorkOrderTrailUseCase {
  constructor(private readonly workOrderQuery: WorkOrderQueryPort) {}

  async execute(query: GetWorkOrderTrailQuery): Promise<WorkOrderTrailEntryDto[]> {
    WorkOrderNumber.create(query.number);
    if (!(await this.workOrderQuery.getByNumber(query.number))) {
      throw new WorkOrderNotFoundError();
    }
    return this.workOrderQuery.listTrail(query.number);
  }
}
