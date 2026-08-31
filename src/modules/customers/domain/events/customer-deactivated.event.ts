import { DomainEvent } from '../../../../shared/domain/domain-event';

export class CustomerDeactivated extends DomainEvent {
  constructor(
    readonly customerId: string,
    occurredAt: Date,
  ) {
    super(occurredAt);
  }
}
