import { DomainEvent } from '../../../../shared/domain/domain-event';

export class UserRegistered extends DomainEvent {
  constructor(
    readonly userId: string,
    readonly email: string,
    occurredAt: Date,
  ) {
    super(occurredAt);
  }
}
