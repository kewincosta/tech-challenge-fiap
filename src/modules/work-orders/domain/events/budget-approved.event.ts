import { WorkOrderStatus } from '../work-order-status';
import { WorkOrderTrailEvent } from './work-order-trail.event';

export const BUDGET_APPROVED_EVENT_TYPE = 'BUDGET_APPROVED';

export class BudgetApproved extends WorkOrderTrailEvent {
  readonly eventType = BUDGET_APPROVED_EVENT_TYPE;

  constructor(workOrderId: string, actorUserId: string, occurredAt: Date) {
    super(
      workOrderId,
      actorUserId,
      WorkOrderStatus.AwaitingApproval,
      WorkOrderStatus.InExecution,
      occurredAt,
    );
  }
}
