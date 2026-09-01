import { WorkOrderTrailEvent } from './work-order-trail.event';

export const ITEM_REMOVED_FROM_WORK_ORDER_EVENT_TYPE = 'ITEM_REMOVED_FROM_WORK_ORDER';

/** Never a transition on its own in this feature's scope - the status is unchanged either side. */
export class ItemRemovedFromWorkOrder extends WorkOrderTrailEvent {
  readonly eventType = ITEM_REMOVED_FROM_WORK_ORDER_EVENT_TYPE;

  constructor(workOrderId: string, actorUserId: string, occurredAt: Date) {
    super(workOrderId, actorUserId, null, null, occurredAt);
  }
}
