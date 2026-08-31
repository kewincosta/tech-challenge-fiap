import { DomainEvent } from '../../../../shared/domain/domain-event';

export class StockAdjusted extends DomainEvent {
  constructor(
    readonly inventoryItemId: string,
    readonly movementId: string,
    readonly quantity: number,
    occurredAt: Date,
  ) {
    super(occurredAt);
  }
}
