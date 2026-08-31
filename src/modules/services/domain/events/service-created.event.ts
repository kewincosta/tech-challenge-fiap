import { DomainEvent } from '../../../../shared/domain/domain-event';

export class ServiceCreated extends DomainEvent {
  constructor(
    readonly serviceId: string,
    occurredAt: Date,
  ) {
    super(occurredAt);
  }
}
