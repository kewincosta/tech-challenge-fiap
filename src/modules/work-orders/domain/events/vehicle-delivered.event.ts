import { WorkOrderStatus } from '../work-order-status';
import { WorkOrderTrailEvent } from './work-order-trail.event';

export const VEHICLE_DELIVERED_EVENT_TYPE = 'VEHICLE_DELIVERED';

export class VehicleDelivered extends WorkOrderTrailEvent {
  readonly eventType = VEHICLE_DELIVERED_EVENT_TYPE;

  constructor(workOrderId: string, actorUserId: string, occurredAt: Date) {
    super(workOrderId, actorUserId, WorkOrderStatus.Completed, WorkOrderStatus.Delivered, occurredAt);
  }
}
