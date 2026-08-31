import { DomainEvent } from '../../../../shared/domain/domain-event';

export class InventoryItemUpdated extends DomainEvent {
  constructor(
    readonly inventoryItemId: string,
    occurredAt: Date,
  ) {
    super(occurredAt);
  }
}
