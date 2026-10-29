import { Clock } from '../../../../../../shared/application/ports/clock.port';
import { DomainEventPublisher } from '../../../../../../shared/application/ports/domain-event-publisher.port';
import { AppPermission } from '../../../../authorization/application/contracts/app-permissions';
import { GetUserEffectiveAccessHandler } from '../../../../authorization/application/queries/get-user-effective-access/get-user-effective-access.handler';
import { GetUserEffectiveAccessQuery } from '../../../../authorization/application/queries/get-user-effective-access/get-user-effective-access.query';
import { SessionNotFoundError } from '../../../domain/errors/session-not-found.error';
import { SessionRevocationReason } from '../../../domain/session-revocation-reason';
import { SessionId } from '../../../domain/value-objects/session-id';
import { AuthSettings } from '../../auth-settings';
import { RevokedSessionStore } from '../../ports/revoked-session-store.port';
import { SessionRepository } from '../../ports/session.repository';
import { RevokeSessionCommand } from './revoke-session.command';

export class RevokeSessionHandler {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly revokedSessions: RevokedSessionStore,
    private readonly clock: Clock,
    private readonly settings: AuthSettings,
    private readonly getUserEffectiveAccess: GetUserEffectiveAccessHandler,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(command: RevokeSessionCommand): Promise<void> {
    const session = await this.sessions.findById(SessionId.create(command.sessionId));
    if (!session) {
      throw new SessionNotFoundError();
    }
    const isOwner = session.userId === command.actorUserId;
    if (!isOwner) {
      const access = await this.getUserEffectiveAccess.execute(
        new GetUserEffectiveAccessQuery(command.actorUserId),
      );
      if (!access.permissions.includes(AppPermission.SessionsRevokeAny)) {
        throw new SessionNotFoundError();
      }
    }
    const reason = isOwner
      ? SessionRevocationReason.Logout
      : SessionRevocationReason.AdminRevocation;
    session.revoke(reason, this.clock.now());
    await this.sessions.save(session);
    await this.revokedSessions.add(session.id.value, this.settings.accessTokenTtlSeconds);
    this.events.publish(session.pullDomainEvents());
  }
}
