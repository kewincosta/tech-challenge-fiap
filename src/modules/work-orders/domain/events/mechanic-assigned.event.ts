import { WorkOrderTrailEvent } from './work-order-trail.event';

export const MECHANIC_ASSIGNED_EVENT_TYPE = 'MECHANIC_ASSIGNED';

/** Never a transition on its own in this feature's scope - the status is unchanged either side. */
export class MechanicAssigned extends WorkOrderTrailEvent {
  readonly eventType = MECHANIC_ASSIGNED_EVENT_TYPE;

  constructor(workOrderId: string, actorUserId: string, occurredAt: Date) {
    super(workOrderId, actorUserId, null, null, occurredAt);
  }
}
