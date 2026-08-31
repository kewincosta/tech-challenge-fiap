import { describe, expect, it } from 'vitest';
import { stubEventBus } from '../../../../../../test/support/fakes/bus.stubs';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { FakeRevokedSessionStore } from '../../../../../../test/support/fakes/fake-revoked-session-store';
import { InMemorySessionRepository } from '../../../../../../test/support/fakes/in-memory-session.repository';
import { buildSession } from '../../../../../../test/support/factories/session.factory';
import { SessionRevocationReason } from '../../../domain/session-revocation-reason';
import { SessionStatus } from '../../../domain/session-status';
import { LogoutCommand } from './logout.command';
import { LogoutHandler } from './logout.handler';

const AUTH_CONFIG = {
  jwtSecret: 'test-secret',
  accessTokenTtlSeconds: 900,
  refreshTokenTtlSeconds: 604800,
  sessionAbsoluteTtlSeconds: 2592000,
};

function makeHandler() {
  const sessions = new InMemorySessionRepository();
  const revokedSessions = new FakeRevokedSessionStore();
  const eventBus = stubEventBus();
  const handler = new LogoutHandler(
    sessions,
    revokedSessions,
    new FakeClock(),
    AUTH_CONFIG,
    eventBus.bus,
  );
  return { handler, sessions, revokedSessions };
}

describe('LogoutHandler', () => {
  it('should revoke the current session and deny its access tokens', async () => {
    const { handler, sessions, revokedSessions } = makeHandler();
    const session = buildSession();
    await sessions.save(session);

    await handler.execute(new LogoutCommand(session.id.value));

    expect(sessions.sessions[0].status).toBe(SessionStatus.Revoked);
    expect(sessions.sessions[0].revocationReason).toBe(SessionRevocationReason.Logout);
    expect(await revokedSessions.isRevoked(session.id.value)).toBe(true);
  });

  it('should ignore a logout for an unknown session', async () => {
    const { handler, sessions } = makeHandler();

    await handler.execute(new LogoutCommand('11111111-1111-4111-8111-111111111111'));

    expect(sessions.saveCount).toBe(0);
  });
});
