import { Clock } from '../../../../../../shared/application/ports/clock.port';
import { DomainEventPublisher } from '../../../../../../shared/application/ports/domain-event-publisher.port';
import { AllUserSessionsRevoked } from '../../../domain/events/all-user-sessions-revoked.event';
import { SessionRevocationReason } from '../../../domain/session-revocation-reason';
import { AuthSettings } from '../../auth-settings';
import { RevokedSessionStore } from '../../ports/revoked-session-store.port';
import { SessionRepository } from '../../ports/session.repository';
import {
  LogoutAllSessionsCommand,
  LogoutAllSessionsResultDto,
} from './logout-all-sessions.command';

export class LogoutAllSessionsUseCase {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly revokedSessions: RevokedSessionStore,
    private readonly clock: Clock,
    private readonly settings: AuthSettings,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(command: LogoutAllSessionsCommand): Promise<LogoutAllSessionsResultDto> {
    const now = this.clock.now();
    const revokedIds = await this.sessions.revokeAllActiveByUserId(
      command.userId,
      SessionRevocationReason.LogoutAll,
      now,
    );
    if (revokedIds.length > 0) {
      await this.revokedSessions.addMany(revokedIds, this.settings.accessTokenTtlSeconds);
      this.events.publish([
        new AllUserSessionsRevoked(
          command.userId,
          revokedIds,
          SessionRevocationReason.LogoutAll,
          now,
        ),
      ]);
    }
    return { revokedSessions: revokedIds.length };
  }
}
