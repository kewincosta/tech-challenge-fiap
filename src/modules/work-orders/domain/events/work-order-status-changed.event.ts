import { DomainEvent } from '../../../../shared/domain/domain-event';
import { WorkOrderStatus } from '../work-order-status';

/** The round of the budget the customer is asked to decide, as it stood at the change. */
export interface BudgetToDecide {
  readonly id: string;
  readonly totalCents: number;
}

/**
 * A work order moved to a new status, or was opened. It is not a trail event: the trail keeps one
 * row per fact, such as `BudgetApproved` and `ExecutionStarted` for a single approval, while this
 * event says once that the status changed, for whoever tells the customer. It carries what that
 * message needs, because by the time a subscriber runs the work order may have moved again.
 */
export class WorkOrderStatusChanged extends DomainEvent {
  constructor(
    readonly workOrderId: string,
    readonly workOrderNumber: string,
    readonly customerId: string,
    readonly vehiclePlate: string,
    /** Null for the opening. */
    readonly fromStatus: WorkOrderStatus | null,
    readonly toStatus: WorkOrderStatus,
    /** The pending round when the work order now awaits approval, otherwise null. */
    readonly budgetToDecide: BudgetToDecide | null,
    occurredAt: Date,
  ) {
    super(occurredAt);
  }
}
