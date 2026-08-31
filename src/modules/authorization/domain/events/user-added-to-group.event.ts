import { DomainEvent } from '../../../../shared/domain/domain-event';

export class UserAddedToGroup extends DomainEvent {
  constructor(
    readonly userId: string,
    readonly groupId: string,
    occurredAt: Date,
  ) {
    super(occurredAt);
  }
}
