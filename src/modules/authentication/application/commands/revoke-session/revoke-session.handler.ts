import { Inject } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { CommandHandler, EventBus, ICommandHandler, QueryBus } from '@nestjs/cqrs';
import { authConfig } from '../../../../../config/auth.config';
import { CLOCK, Clock } from '../../../../../shared/application/ports/clock.port';
import { AppPermission } from '../../../../authorization/application/contracts/app-permissions';
import { EffectiveAccessDto } from '../../../../authorization/application/dtos/effective-access.dto';
import { GetUserEffectiveAccessQuery } from '../../../../authorization/application/queries/get-user-effective-access/get-user-effective-access.query';
import { SessionNotFoundError } from '../../../domain/errors/session-not-found.error';
import {
  SESSION_REPOSITORY,
  SessionRepository,
} from '../../../domain/repositories/session.repository';
import { SessionRevocationReason } from '../../../domain/session-revocation-reason';
import { SessionId } from '../../../domain/value-objects/session-id';
import { REVOKED_SESSION_STORE, RevokedSessionStore } from '../../ports/revoked-session-store.port';
import { RevokeSessionCommand } from './revoke-session.command';

@CommandHandler(RevokeSessionCommand)
export class RevokeSessionHandler implements ICommandHandler<RevokeSessionCommand, void> {
  constructor(
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(REVOKED_SESSION_STORE) private readonly revokedSessions: RevokedSessionStore,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(authConfig.KEY) private readonly config: ConfigType<typeof authConfig>,
    private readonly queryBus: QueryBus,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: RevokeSessionCommand): Promise<void> {
    const session = await this.sessions.findById(SessionId.create(command.sessionId));
    if (!session) {
      throw new SessionNotFoundError();
    }
    const isOwner = session.userId === command.actorUserId;
    if (!isOwner) {
      const access = await this.queryBus.execute<GetUserEffectiveAccessQuery, EffectiveAccessDto>(
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
    await this.revokedSessions.add(session.id.value, this.config.accessTokenTtlSeconds);
    this.eventBus.publishAll(session.pullDomainEvents());
  }
}
