import { DomainEvent } from '../../../../shared/domain/domain-event';

export class SessionCreated extends DomainEvent {
  constructor(
    readonly sessionId: string,
    readonly userId: string,
    occurredAt: Date,
  ) {
    super(occurredAt);
  }
}
