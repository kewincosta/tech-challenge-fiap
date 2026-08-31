import { Inject } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs';
import { authConfig } from '../../../../../config/auth.config';
import { CLOCK, Clock } from '../../../../../shared/application/ports/clock.port';
import {
  SESSION_REPOSITORY,
  SessionRepository,
} from '../../../domain/repositories/session.repository';
import { SessionRevocationReason } from '../../../domain/session-revocation-reason';
import { SessionId } from '../../../domain/value-objects/session-id';
import {
  REVOKED_SESSION_STORE,
  RevokedSessionStore,
} from '../../ports/revoked-session-store.port';
import { LogoutCommand } from './logout.command';

@CommandHandler(LogoutCommand)
export class LogoutHandler implements ICommandHandler<LogoutCommand, void> {
  constructor(
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(REVOKED_SESSION_STORE) private readonly revokedSessions: RevokedSessionStore,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(authConfig.KEY) private readonly config: ConfigType<typeof authConfig>,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: LogoutCommand): Promise<void> {
    const session = await this.sessions.findById(SessionId.create(command.sessionId));
    if (!session) {
      return;
    }
    session.revoke(SessionRevocationReason.Logout, this.clock.now());
    await this.sessions.save(session);
    await this.revokedSessions.add(session.id.value, this.config.accessTokenTtlSeconds);
    this.eventBus.publishAll(session.pullDomainEvents());
  }
}
