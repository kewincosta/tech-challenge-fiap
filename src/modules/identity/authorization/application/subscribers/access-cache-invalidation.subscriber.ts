import { DomainEventSubscriber } from '../../../../../shared/application/ports/domain-event-publisher.port';
import { RoleAssignedToUser } from '../../domain/events/role-assigned-to-user.event';
import { RoleRevokedFromUser } from '../../domain/events/role-revoked-from-user.event';
import { EffectiveAccessService } from '../services/effective-access.service';

type AccessChangedEvent = RoleAssignedToUser | RoleRevokedFromUser;

export class AccessCacheInvalidationSubscriber implements DomainEventSubscriber<AccessChangedEvent> {
  constructor(private readonly effectiveAccess: EffectiveAccessService) {}

  async handle(event: AccessChangedEvent): Promise<void> {
    await this.effectiveAccess.invalidate(event.userId);
  }
}
