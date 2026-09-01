import { WorkOrderStatus } from '../work-order-status';
import { WorkOrderTrailEvent } from './work-order-trail.event';

export const EXECUTION_STARTED_EVENT_TYPE = 'EXECUTION_STARTED';

/**
 * Recorded on every entry into `IN_EXECUTION` - approving any round, or rejecting a round above
 * one - unlike the `executionStartedAt` prop, which is set once and never overwritten.
 */
export class ExecutionStarted extends WorkOrderTrailEvent {
  readonly eventType = EXECUTION_STARTED_EVENT_TYPE;

  constructor(workOrderId: string, actorUserId: string, occurredAt: Date) {
    super(
      workOrderId,
      actorUserId,
      WorkOrderStatus.AwaitingApproval,
      WorkOrderStatus.InExecution,
      occurredAt,
    );
  }
}
