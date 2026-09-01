import { WorkOrderStatus } from '../work-order-status';
import { WorkOrderTrailEvent } from './work-order-trail.event';

export const DIAGNOSIS_COMPLETED_EVENT_TYPE = 'DIAGNOSIS_COMPLETED';

export class DiagnosisCompleted extends WorkOrderTrailEvent {
  readonly eventType = DIAGNOSIS_COMPLETED_EVENT_TYPE;

  constructor(workOrderId: string, actorUserId: string, occurredAt: Date) {
    super(
      workOrderId,
      actorUserId,
      WorkOrderStatus.InDiagnosis,
      WorkOrderStatus.AwaitingApproval,
      occurredAt,
    );
  }
}
