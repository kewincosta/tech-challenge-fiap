import { WorkOrderStatus } from '../work-order-status';
import { WorkOrderTrailEvent } from './work-order-trail.event';

export const WORK_ORDER_COMPLETED_EVENT_TYPE = 'WORK_ORDER_COMPLETED';

export class WorkOrderCompleted extends WorkOrderTrailEvent {
  readonly eventType = WORK_ORDER_COMPLETED_EVENT_TYPE;

  constructor(workOrderId: string, actorUserId: string, occurredAt: Date) {
    super(
      workOrderId,
      actorUserId,
      WorkOrderStatus.InExecution,
      WorkOrderStatus.Completed,
      occurredAt,
    );
  }
}
