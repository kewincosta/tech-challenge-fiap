import { WorkOrderTrailEvent } from './work-order-trail.event';

export const PART_RETURNED_EVENT_TYPE = 'PART_RETURNED';

/** Never a transition on its own - the work order stays IN_EXECUTION either side. */
export class PartReturned extends WorkOrderTrailEvent {
  readonly eventType = PART_RETURNED_EVENT_TYPE;

  constructor(workOrderId: string, actorUserId: string, occurredAt: Date) {
    super(workOrderId, actorUserId, null, null, occurredAt);
  }
}
