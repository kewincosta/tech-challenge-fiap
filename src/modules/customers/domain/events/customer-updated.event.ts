import { DomainEvent } from '../../../../shared/domain/domain-event';

export class CustomerUpdated extends DomainEvent {
  constructor(
    readonly customerId: string,
    occurredAt: Date,
  ) {
    super(occurredAt);
  }
}
