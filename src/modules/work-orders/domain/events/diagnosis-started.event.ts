import { WorkOrderStatus } from '../work-order-status';
import { WorkOrderTrailEvent } from './work-order-trail.event';

export const DIAGNOSIS_STARTED_EVENT_TYPE = 'DIAGNOSIS_STARTED';

export class DiagnosisStarted extends WorkOrderTrailEvent {
  readonly eventType = DIAGNOSIS_STARTED_EVENT_TYPE;

  constructor(workOrderId: string, actorUserId: string, occurredAt: Date) {
    super(workOrderId, actorUserId, WorkOrderStatus.Received, WorkOrderStatus.InDiagnosis, occurredAt);
  }
}
