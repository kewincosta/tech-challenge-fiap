import { DomainEvent } from '../../../../shared/domain/domain-event';

export class UserRemovedFromGroup extends DomainEvent {
  constructor(
    readonly userId: string,
    readonly groupId: string,
    occurredAt: Date,
  ) {
    super(occurredAt);
  }
}
