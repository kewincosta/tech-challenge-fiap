import { WorkOrderTrailEvent } from './work-order-trail.event';

export const PART_PLANNED_FOR_WORK_ORDER_EVENT_TYPE = 'PART_PLANNED_FOR_WORK_ORDER';

/** Never a transition on its own in this feature's scope - the status is unchanged either side. */
export class PartPlannedForWorkOrder extends WorkOrderTrailEvent {
  readonly eventType = PART_PLANNED_FOR_WORK_ORDER_EVENT_TYPE;

  constructor(workOrderId: string, actorUserId: string, occurredAt: Date) {
    super(workOrderId, actorUserId, null, null, occurredAt);
  }
}
