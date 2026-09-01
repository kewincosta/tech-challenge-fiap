import { WorkOrderTrailEvent } from './work-order-trail.event';

export const BUDGET_GENERATED_EVENT_TYPE = 'BUDGET_GENERATED';

/** Describes a fact, not a move - the work order's status is unchanged by generating a round. */
export class BudgetGenerated extends WorkOrderTrailEvent {
  readonly eventType = BUDGET_GENERATED_EVENT_TYPE;

  constructor(workOrderId: string, actorUserId: string, occurredAt: Date) {
    super(workOrderId, actorUserId, null, null, occurredAt);
  }
}
