import { WorkOrderStatus } from '../../../domain/work-order-status';
import { WorkOrderQueryPort } from '../../ports/work-order-query.port';
import { ListWorkOrdersQuery, WorkOrderPageDto } from './list-work-orders.query';

/** The order the board lists statuses in: the work in progress first, closed orders last. */
const BOARD_STATUS_ORDER: readonly WorkOrderStatus[] = [
  WorkOrderStatus.InExecution,
  WorkOrderStatus.AwaitingApproval,
  WorkOrderStatus.InDiagnosis,
  WorkOrderStatus.Received,
  WorkOrderStatus.Completed,
  WorkOrderStatus.Delivered,
  WorkOrderStatus.Canceled,
];

/** What the board lists when no status is asked for: completed, delivered and canceled work
 * orders are left out, and a status filter brings them back. */
const OPEN_STATUSES: readonly WorkOrderStatus[] = [
  WorkOrderStatus.InExecution,
  WorkOrderStatus.AwaitingApproval,
  WorkOrderStatus.InDiagnosis,
  WorkOrderStatus.Received,
];

export class ListWorkOrdersUseCase {
  constructor(private readonly workOrderQuery: WorkOrderQueryPort) {}

  async execute(query: ListWorkOrdersQuery): Promise<WorkOrderPageDto> {
    const wanted = query.statuses.length > 0 ? query.statuses : OPEN_STATUSES;
    const { items, totalItems } = await this.workOrderQuery.listBoard({
      statuses: BOARD_STATUS_ORDER.filter((status) => wanted.includes(status)),
      page: query.page,
      pageSize: query.pageSize,
    });
    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / query.pageSize),
    };
  }
}
