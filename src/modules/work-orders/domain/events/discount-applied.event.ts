import { WorkOrderTrailEvent } from './work-order-trail.event';

export const DISCOUNT_APPLIED_EVENT_TYPE = 'DISCOUNT_APPLIED';

/** Never a transition on its own - the work order's status is unchanged either side. */
export class DiscountApplied extends WorkOrderTrailEvent {
  readonly eventType = DISCOUNT_APPLIED_EVENT_TYPE;

  constructor(workOrderId: string, actorUserId: string, occurredAt: Date) {
    super(workOrderId, actorUserId, null, null, occurredAt);
  }
}
