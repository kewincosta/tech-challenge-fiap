import { describe, expect, it } from 'vitest';
import { stubEventBus } from '../../../../../../test/support/fakes/bus.stubs';
import { FakeAccessTokenService } from '../../../../../../test/support/fakes/fake-access-token.service';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { FakeIdGenerator } from '../../../../../../test/support/fakes/fake-id-generator';
import { FakeRefreshTokenHasher } from '../../../../../../test/support/fakes/fake-refresh-token-hasher';
import { FakeRevokedSessionStore } from '../../../../../../test/support/fakes/fake-revoked-session-store';
import { InMemorySessionRepository } from '../../../../../../test/support/fakes/in-memory-session.repository';
import { buildSession } from '../../../../../../test/support/factories/session.factory';
import { InvalidRefreshTokenError } from '../../../domain/errors/invalid-refresh-token.error';
import { RefreshTokenReuseError } from '../../../domain/errors/refresh-token-reuse.error';
import { SessionRevocationReason } from '../../../domain/session-revocation-reason';
import { SessionStatus } from '../../../domain/session-status';
import { RefreshSessionCommand } from './refresh-session.command';
import { RefreshSessionHandler } from './refresh-session.handler';

const AUTH_CONFIG = {
  jwtSecret: 'test-secret',
  accessTokenTtlSeconds: 900,
  refreshTokenTtlSeconds: 604800,
  sessionAbsoluteTtlSeconds: 2592000,
};

function makeHandler() {
  const sessions = new InMemorySessionRepository();
  const revokedSessions = new FakeRevokedSessionStore();
  const clock = new FakeClock();
  const eventBus = stubEventBus();
  const handler = new RefreshSessionHandler(
    sessions,
    new FakeAccessTokenService(),
    new FakeRefreshTokenHasher(),
    revokedSessions,
    new FakeIdGenerator(),
    clock,
    AUTH_CONFIG,
    eventBus.bus,
  );
  return { handler, sessions, revokedSessions, clock, eventBus };
}

describe('RefreshSessionHandler', () => {
  it('should rotate the refresh token and issue a new pair', async () => {
    const { handler, sessions, clock } = makeHandler();
    const session = buildSession({ initialTokenHash: 'hash(refresh-1)' });
    await sessions.save(session);
    clock.advanceSeconds(600);

    const result = await handler.execute(new RefreshSessionCommand('refresh-1'));

    expect(result.refreshToken).not.toBe('refresh-1');
    expect(result.sessionId).toBe(session.id.value);
    expect(sessions.sessions[0].activeToken.tokenHash.value).toBe(`hash(${result.refreshToken})`);
  });

  it('should not refresh with an unknown refresh token', async () => {
    const { handler } = makeHandler();

    await expect(handler.execute(new RefreshSessionCommand('ghost'))).rejects.toThrow(
      InvalidRefreshTokenError,
    );
  });

  it('should revoke the session and deny access when a rotated token is reused', async () => {
    const { handler, sessions, revokedSessions, clock } = makeHandler();
    const session = buildSession({ initialTokenHash: 'hash(refresh-1)' });
    await sessions.save(session);
    clock.advanceSeconds(600);
    await handler.execute(new RefreshSessionCommand('refresh-1'));
    clock.advanceSeconds(600);

    await expect(handler.execute(new RefreshSessionCommand('refresh-1'))).rejects.toThrow(
      RefreshTokenReuseError,
    );

    expect(sessions.sessions[0].status).toBe(SessionStatus.Revoked);
    expect(await revokedSessions.isRevoked(session.id.value)).toBe(true);
  });

  it('should not refresh a revoked session', async () => {
    const { handler, sessions, clock } = makeHandler();
    const session = buildSession({ initialTokenHash: 'hash(refresh-1)' });
    await sessions.save(session);
    session.revoke(SessionRevocationReason.Logout, clock.now());
    clock.advanceSeconds(600);

    await expect(handler.execute(new RefreshSessionCommand('refresh-1'))).rejects.toThrow();
  });
});
