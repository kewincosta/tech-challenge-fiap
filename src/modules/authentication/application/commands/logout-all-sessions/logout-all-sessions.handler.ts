import { Inject } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs';
import { authConfig } from '../../../../../config/auth.config';
import { CLOCK, Clock } from '../../../../../shared/application/ports/clock.port';
import { AllUserSessionsRevoked } from '../../../domain/events/all-user-sessions-revoked.event';
import {
  SESSION_REPOSITORY,
  SessionRepository,
} from '../../../domain/repositories/session.repository';
import { SessionRevocationReason } from '../../../domain/session-revocation-reason';
import { REVOKED_SESSION_STORE, RevokedSessionStore } from '../../ports/revoked-session-store.port';
import {
  LogoutAllSessionsCommand,
  LogoutAllSessionsResultDto,
} from './logout-all-sessions.command';

@CommandHandler(LogoutAllSessionsCommand)
export class LogoutAllSessionsHandler implements ICommandHandler<
  LogoutAllSessionsCommand,
  LogoutAllSessionsResultDto
> {
  constructor(
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(REVOKED_SESSION_STORE) private readonly revokedSessions: RevokedSessionStore,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(authConfig.KEY) private readonly config: ConfigType<typeof authConfig>,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: LogoutAllSessionsCommand): Promise<LogoutAllSessionsResultDto> {
    const now = this.clock.now();
    const revokedIds = await this.sessions.revokeAllActiveByUserId(
      command.userId,
      SessionRevocationReason.LogoutAll,
      now,
    );
    if (revokedIds.length > 0) {
      await this.revokedSessions.addMany(revokedIds, this.config.accessTokenTtlSeconds);
      this.eventBus.publish(
        new AllUserSessionsRevoked(
          command.userId,
          revokedIds,
          SessionRevocationReason.LogoutAll,
          now,
        ),
      );
    }
    return { revokedSessions: revokedIds.length };
  }
}
