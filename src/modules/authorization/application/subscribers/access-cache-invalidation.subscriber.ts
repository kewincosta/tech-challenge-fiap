import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { RoleAssignedToUser } from '../../domain/events/role-assigned-to-user.event';
import { RoleRevokedFromUser } from '../../domain/events/role-revoked-from-user.event';
import { EffectiveAccessService } from '../services/effective-access.service';

type AccessChangedEvent = RoleAssignedToUser | RoleRevokedFromUser;

@EventsHandler(RoleAssignedToUser, RoleRevokedFromUser)
export class AccessCacheInvalidationSubscriber implements IEventHandler<AccessChangedEvent> {
  constructor(private readonly effectiveAccess: EffectiveAccessService) {}

  async handle(event: AccessChangedEvent): Promise<void> {
    await this.effectiveAccess.invalidate(event.userId);
  }
}
