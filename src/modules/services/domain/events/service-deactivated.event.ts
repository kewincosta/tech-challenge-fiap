import { DomainEvent } from '../../../../shared/domain/domain-event';

export class ServiceDeactivated extends DomainEvent {
  constructor(
    readonly serviceId: string,
    occurredAt: Date,
  ) {
    super(occurredAt);
  }
}
