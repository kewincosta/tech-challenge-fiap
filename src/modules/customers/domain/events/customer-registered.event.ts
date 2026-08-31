import { DomainEvent } from '../../../../shared/domain/domain-event';

export class CustomerRegistered extends DomainEvent {
  constructor(
    readonly customerId: string,
    readonly userId: string,
    occurredAt: Date,
  ) {
    super(occurredAt);
  }
}
