import { DomainEvent } from '../../../../shared/domain/domain-event';
import { WorkOrderStatus } from '../work-order-status';

/**
 * The shape every trail entry shares. `eventType` is declared abstract rather than derived from
 * `constructor.name`: a class rename would otherwise silently change what an already-written,
 * append-only `work_order_events` row means (design.md's Risks & Concerns).
 */
export abstract class WorkOrderTrailEvent extends DomainEvent {
  abstract readonly eventType: string;

  protected constructor(
    readonly workOrderId: string,
    readonly actorUserId: string,
    readonly fromStatus: WorkOrderStatus | null,
    readonly toStatus: WorkOrderStatus | null,
    occurredAt: Date,
  ) {
    super(occurredAt);
  }
}
