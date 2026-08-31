import { DomainEvent } from '../../../../shared/domain/domain-event';

export class ServiceUpdated extends DomainEvent {
  constructor(
    readonly serviceId: string,
    occurredAt: Date,
  ) {
    super(occurredAt);
  }
}
