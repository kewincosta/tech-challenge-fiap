import { DomainEvent } from '../../../../shared/domain/domain-event';

export class RoleRevokedFromUser extends DomainEvent {
  constructor(
    readonly userId: string,
    readonly roleId: string,
    occurredAt: Date,
  ) {
    super(occurredAt);
  }
}
