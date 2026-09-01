import { WorkOrderTrailEvent } from './work-order-trail.event';

export const BUDGET_SENT_EVENT_TYPE = 'BUDGET_SENT';

/**
 * H8: "sent" means the budget is available to be read, with no real dispatch. This trail entry
 * is the record that it went out.
 */
export class BudgetSent extends WorkOrderTrailEvent {
  readonly eventType = BUDGET_SENT_EVENT_TYPE;

  constructor(workOrderId: string, actorUserId: string, occurredAt: Date) {
    super(workOrderId, actorUserId, null, null, occurredAt);
  }
}
