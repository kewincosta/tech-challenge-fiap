import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../../../../../../test/support/fakes/fake-clock';
import { FakeRevokedSessionStore } from '../../../../../../../test/support/fakes/fake-revoked-session-store';
import { InMemorySessionRepository } from '../../../../../../../test/support/fakes/in-memory-session.repository';
import { RecordingDomainEventPublisher } from '../../../../../../../test/support/fakes/recording-domain-event-publisher';
import { buildSession } from '../../../../../../../test/support/factories/session.factory';
import { AllUserSessionsRevoked } from '../../../domain/events/all-user-sessions-revoked.event';
import { SessionRevocationReason } from '../../../domain/session-revocation-reason';
import { SessionStatus } from '../../../domain/session-status';
import { AuthSettings } from '../../auth-settings';
import { LogoutAllSessionsCommand } from './logout-all-sessions.command';
import { LogoutAllSessionsUseCase } from './logout-all-sessions.use-case';

const SETTINGS: AuthSettings = {
  accessTokenTtlSeconds: 900,
  refreshTokenTtlSeconds: 604800,
  sessionAbsoluteTtlSeconds: 2592000,
};

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';

function makeHandler() {
  const sessions = new InMemorySessionRepository();
  const revokedSessions = new FakeRevokedSessionStore();
  const events = new RecordingDomainEventPublisher();
  const clock = new FakeClock();
  const handler = new LogoutAllSessionsUseCase(sessions, revokedSessions, clock, SETTINGS, events);
  return { handler, sessions, revokedSessions, events, clock };
}

describe('LogoutAllSessionsUseCase', () => {
  it('should revoke every active session of the user and keep other users untouched', async () => {
    const { handler, sessions, revokedSessions, events, clock } = makeHandler();
    const first = buildSession({ userId: USER_ID });
    const second = buildSession({ userId: USER_ID });
    const foreign = buildSession({ userId: OTHER_USER_ID });
    await sessions.save(first);
    await sessions.save(second);
    await sessions.save(foreign);

    const result = await handler.execute(new LogoutAllSessionsCommand(USER_ID));

    expect(result.revokedSessions).toBe(2);
    expect(first.status).toBe(SessionStatus.Revoked);
    expect(second.status).toBe(SessionStatus.Revoked);
    expect(foreign.status).toBe(SessionStatus.Active);
    expect(await revokedSessions.isRevoked(first.id.value)).toBe(true);
    expect(await revokedSessions.isRevoked(foreign.id.value)).toBe(false);
    expect(events.published).toEqual([
      new AllUserSessionsRevoked(
        USER_ID,
        [first.id.value, second.id.value],
        SessionRevocationReason.LogoutAll,
        clock.now(),
      ),
    ]);
  });

  it('should keep each revoked session marked for the access token lifetime of the settings', async () => {
    const { sessions, revokedSessions, clock } = makeHandler();
    const session = buildSession({ userId: USER_ID });
    await sessions.save(session);
    const handler = new LogoutAllSessionsUseCase(
      sessions,
      revokedSessions,
      clock,
      { accessTokenTtlSeconds: 111, refreshTokenTtlSeconds: 600, sessionAbsoluteTtlSeconds: 2000 },
      new RecordingDomainEventPublisher(),
    );

    await handler.execute(new LogoutAllSessionsCommand(USER_ID));

    expect(revokedSessions.ttlSeconds.get(session.id.value)).toBe(111);
  });

  it('should report zero revoked sessions when the user has none', async () => {
    const { handler, events } = makeHandler();

    const result = await handler.execute(new LogoutAllSessionsCommand(USER_ID));

    expect(result.revokedSessions).toBe(0);
    expect(events.published).toEqual([]);
  });
});
