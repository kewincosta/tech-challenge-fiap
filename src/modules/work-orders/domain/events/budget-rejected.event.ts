import { WorkOrderStatus } from '../work-order-status';
import { WorkOrderTrailEvent } from './work-order-trail.event';

export const BUDGET_REJECTED_EVENT_TYPE = 'BUDGET_REJECTED';

/**
 * `toStatus` is not fixed like the other transition events: round one returns the work order to
 * `IN_DIAGNOSIS`, but a later round returns it to `IN_EXECUTION` (H38).
 */
export class BudgetRejected extends WorkOrderTrailEvent {
  readonly eventType = BUDGET_REJECTED_EVENT_TYPE;

  constructor(workOrderId: string, actorUserId: string, toStatus: WorkOrderStatus, occurredAt: Date) {
    super(workOrderId, actorUserId, WorkOrderStatus.AwaitingApproval, toStatus, occurredAt);
  }
}
