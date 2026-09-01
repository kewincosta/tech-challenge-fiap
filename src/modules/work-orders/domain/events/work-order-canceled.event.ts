import { WorkOrderStatus } from '../work-order-status';
import { WorkOrderTrailEvent } from './work-order-trail.event';

export const WORK_ORDER_CANCELED_EVENT_TYPE = 'WORK_ORDER_CANCELED';

/**
 * `fromStatus` is not fixed like most transition events: a work order can be cancelled from
 * `RECEIVED`, `IN_DIAGNOSIS`, `AWAITING_APPROVAL` or `IN_EXECUTION` (H4), so the trail needs to
 * say which one it actually left.
 */
export class WorkOrderCanceled extends WorkOrderTrailEvent {
  readonly eventType = WORK_ORDER_CANCELED_EVENT_TYPE;

  constructor(workOrderId: string, actorUserId: string, fromStatus: WorkOrderStatus, occurredAt: Date) {
    super(workOrderId, actorUserId, fromStatus, WorkOrderStatus.Canceled, occurredAt);
  }
}
