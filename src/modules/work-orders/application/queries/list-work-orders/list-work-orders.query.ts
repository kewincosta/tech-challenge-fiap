import { WorkOrderStatus } from '../../../domain/work-order-status';
import { WorkOrderSummaryDto } from '../../ports/work-order-query.port';

export class ListWorkOrdersQuery {
  constructor(
    /** From 1. */
    readonly page: number,
    readonly pageSize: number,
    /** Empty lists the work still open. */
    readonly statuses: readonly WorkOrderStatus[] = [],
  ) {}
}

export interface WorkOrderPageDto {
  items: WorkOrderSummaryDto[];
  page: number;
  pageSize: number;
  /** Every work order the listing matches, whichever page was asked for. */
  totalItems: number;
  /** `totalItems` divided by `pageSize`, rounded up: 0 when nothing matches. */
  totalPages: number;
}
