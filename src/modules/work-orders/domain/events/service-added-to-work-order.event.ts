import { WorkOrderTrailEvent } from './work-order-trail.event';

export const SERVICE_ADDED_TO_WORK_ORDER_EVENT_TYPE = 'SERVICE_ADDED_TO_WORK_ORDER';

/** Never a transition on its own in this feature's scope - the status is unchanged either side. */
export class ServiceAddedToWorkOrder extends WorkOrderTrailEvent {
  readonly eventType = SERVICE_ADDED_TO_WORK_ORDER_EVENT_TYPE;

  constructor(workOrderId: string, actorUserId: string, occurredAt: Date) {
    super(workOrderId, actorUserId, null, null, occurredAt);
  }
}
