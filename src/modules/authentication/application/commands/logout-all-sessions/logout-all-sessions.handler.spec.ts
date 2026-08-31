import { describe, expect, it } from 'vitest';
import { stubEventBus } from '../../../../../../test/support/fakes/bus.stubs';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { FakeRevokedSessionStore } from '../../../../../../test/support/fakes/fake-revoked-session-store';
import { InMemorySessionRepository } from '../../../../../../test/support/fakes/in-memory-session.repository';
import { buildSession } from '../../../../../../test/support/factories/session.factory';
import { AllUserSessionsRevoked } from '../../../domain/events/all-user-sessions-revoked.event';
import { SessionStatus } from '../../../domain/session-status';
import { LogoutAllSessionsCommand } from './logout-all-sessions.command';
import { LogoutAllSessionsHandler } from './logout-all-sessions.handler';

const AUTH_CONFIG = {
  jwtSecret: 'test-secret',
  accessTokenTtlSeconds: 900,
  refreshTokenTtlSeconds: 604800,
  sessionAbsoluteTtlSeconds: 2592000,
};

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';

function makeHandler() {
  const sessions = new InMemorySessionRepository();
  const revokedSessions = new FakeRevokedSessionStore();
  const eventBus = stubEventBus();
  const handler = new LogoutAllSessionsHandler(
    sessions,
    revokedSessions,
    new FakeClock(),
    AUTH_CONFIG,
    eventBus.bus,
  );
  return { handler, sessions, revokedSessions, eventBus };
}

describe('LogoutAllSessionsHandler', () => {
  it('should revoke every active session of the user and keep other users untouched', async () => {
    const { handler, sessions, revokedSessions, eventBus } = makeHandler();
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
    expect(eventBus.publish).toHaveBeenCalledWith(expect.any(AllUserSessionsRevoked));
  });

  it('should report zero revoked sessions when the user has none', async () => {
    const { handler, eventBus } = makeHandler();

    const result = await handler.execute(new LogoutAllSessionsCommand(USER_ID));

    expect(result.revokedSessions).toBe(0);
    expect(eventBus.publish).not.toHaveBeenCalled();
  });
});
