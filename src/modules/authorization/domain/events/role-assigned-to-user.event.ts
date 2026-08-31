import { DomainEvent } from '../../../../shared/domain/domain-event';

export class RoleAssignedToUser extends DomainEvent {
  constructor(
    readonly userId: string,
    readonly roleId: string,
    readonly roleName: string,
    occurredAt: Date,
  ) {
    super(occurredAt);
  }
}
