import { describe, expect, it } from 'vitest';
import { FakeAccessTokenService } from '../../../../../../../test/support/fakes/fake-access-token.service';
import { FakeClock } from '../../../../../../../test/support/fakes/fake-clock';
import { FakeIdGenerator } from '../../../../../../../test/support/fakes/fake-id-generator';
import { FakeRefreshTokenHasher } from '../../../../../../../test/support/fakes/fake-refresh-token-hasher';
import { FakeRevokedSessionStore } from '../../../../../../../test/support/fakes/fake-revoked-session-store';
import { InMemorySessionRepository } from '../../../../../../../test/support/fakes/in-memory-session.repository';
import { InMemoryUserRepository } from '../../../../../../../test/support/fakes/in-memory-user.repository';
import { RecordingDomainEventPublisher } from '../../../../../../../test/support/fakes/recording-domain-event-publisher';
import { buildSession } from '../../../../../../../test/support/factories/session.factory';
import { buildUser } from '../../../../../../../test/support/factories/user.factory';
import { GetUserByIdHandler } from '../../../../users/application/queries/get-user-by-id/get-user-by-id.handler';
import { UserNotFoundError } from '../../../../users/domain/errors/user-not-found.error';
import { InvalidRefreshTokenError } from '../../../domain/errors/invalid-refresh-token.error';
import { RefreshTokenReuseError } from '../../../domain/errors/refresh-token-reuse.error';
import { RefreshTokenReuseDetected } from '../../../domain/events/refresh-token-reuse-detected.event';
import { RefreshTokenRotated } from '../../../domain/events/refresh-token-rotated.event';
import { SessionRevoked } from '../../../domain/events/session-revoked.event';
import { SessionRevocationReason } from '../../../domain/session-revocation-reason';
import { SessionStatus } from '../../../domain/session-status';
import { AuthSettings } from '../../auth-settings';
import { RefreshSessionCommand } from './refresh-session.command';
import { RefreshSessionHandler } from './refresh-session.handler';

const SETTINGS: AuthSettings = {
  accessTokenTtlSeconds: 900,
  refreshTokenTtlSeconds: 604800,
  sessionAbsoluteTtlSeconds: 2592000,
};

const USER_ID = '11111111-1111-4111-8111-111111111111';

// The user is the real lookup over the in-memory users, pending a password change when a case
// says so, and missing when a case says the account is gone.
async function makeHandler(
  options: { mustChangePassword?: boolean; settings?: AuthSettings; userExists?: boolean } = {},
) {
  const users = new InMemoryUserRepository();
  if (options.userExists ?? true) {
    await users.save(buildUser({ id: USER_ID, temporary: options.mustChangePassword }));
  }
  const sessions = new InMemorySessionRepository();
  const revokedSessions = new FakeRevokedSessionStore();
  const clock = new FakeClock();
  const events = new RecordingDomainEventPublisher();
  const handler = new RefreshSessionHandler(
    sessions,
    new FakeAccessTokenService(),
    new FakeRefreshTokenHasher(),
    revokedSessions,
    new FakeIdGenerator(),
    clock,
    options.settings ?? SETTINGS,
    new GetUserByIdHandler(users),
    events,
  );
  return { handler, sessions, revokedSessions, clock, events };
}

// A stored session has no pending events, like one the repository loaded.
function storedSession() {
  const session = buildSession({ userId: USER_ID, initialTokenHash: 'hash(refresh-1)' });
  session.pullDomainEvents();
  return session;
}

describe('RefreshSessionHandler', () => {
  it('should rotate the refresh token and issue a new pair', async () => {
    const { handler, sessions, clock, events } = await makeHandler();
    const session = storedSession();
    const rotatedTokenId = session.activeToken.id.value;
    await sessions.save(session);
    clock.advanceSeconds(600);

    const result = await handler.execute(new RefreshSessionCommand('refresh-1'));

    expect(result.refreshToken).not.toBe('refresh-1');
    expect(result.sessionId).toBe(session.id.value);
    expect(sessions.sessions[0].activeToken.tokenHash.value).toBe(`hash(${result.refreshToken})`);
    expect(events.published).toEqual([
      new RefreshTokenRotated(
        session.id.value,
        USER_ID,
        rotatedTokenId,
        sessions.sessions[0].activeToken.id.value,
        clock.now(),
      ),
    ]);
  });

  it('should re-read the pending password flag on every refresh', async () => {
    const { handler, sessions, clock } = await makeHandler({ mustChangePassword: true });
    await sessions.save(storedSession());
    clock.advanceSeconds(600);

    const result = await handler.execute(new RefreshSessionCommand('refresh-1'));

    expect(result.accessToken.endsWith(':true')).toBe(true);
  });

  it('should expire the new refresh token after the refresh lifetime of the settings', async () => {
    const { handler, sessions, clock } = await makeHandler({
      settings: {
        accessTokenTtlSeconds: 111,
        refreshTokenTtlSeconds: 600,
        sessionAbsoluteTtlSeconds: 2592000,
      },
    });
    await sessions.save(storedSession());
    clock.advanceSeconds(300);

    const result = await handler.execute(new RefreshSessionCommand('refresh-1'));

    expect(result.refreshTokenExpiresAt).toBe(
      new Date(clock.now().getTime() + 600 * 1000).toISOString(),
    );
  });

  it('should refuse the refresh of a session whose account no longer exists with the user not-found error', async () => {
    const { handler, sessions, clock } = await makeHandler({ userExists: false });
    await sessions.save(storedSession());
    clock.advanceSeconds(600);

    await expect(handler.execute(new RefreshSessionCommand('refresh-1'))).rejects.toThrow(
      UserNotFoundError,
    );
  });

  it('should not refresh with an unknown refresh token', async () => {
    const { handler } = await makeHandler();

    await expect(handler.execute(new RefreshSessionCommand('ghost'))).rejects.toThrow(
      InvalidRefreshTokenError,
    );
  });

  it('should revoke the session and deny access when a rotated token is reused', async () => {
    const { handler, sessions, revokedSessions, clock, events } = await makeHandler({
      settings: {
        accessTokenTtlSeconds: 111,
        refreshTokenTtlSeconds: 604800,
        sessionAbsoluteTtlSeconds: 2592000,
      },
    });
    const session = storedSession();
    const rotatedTokenId = session.activeToken.id.value;
    await sessions.save(session);
    clock.advanceSeconds(600);
    await handler.execute(new RefreshSessionCommand('refresh-1'));
    clock.advanceSeconds(600);

    await expect(handler.execute(new RefreshSessionCommand('refresh-1'))).rejects.toThrow(
      RefreshTokenReuseError,
    );

    expect(sessions.sessions[0].status).toBe(SessionStatus.Revoked);
    expect(await revokedSessions.isRevoked(session.id.value)).toBe(true);
    expect(revokedSessions.ttlSeconds.get(session.id.value)).toBe(111);
    expect(events.published.slice(1)).toEqual([
      new SessionRevoked(
        session.id.value,
        USER_ID,
        SessionRevocationReason.TokenReuse,
        clock.now(),
      ),
      new RefreshTokenReuseDetected(session.id.value, USER_ID, rotatedTokenId, clock.now()),
    ]);
  });

  it('should not refresh a revoked session', async () => {
    const { handler, sessions, clock } = await makeHandler();
    const session = storedSession();
    await sessions.save(session);
    session.revoke(SessionRevocationReason.Logout, clock.now());
    clock.advanceSeconds(600);

    await expect(handler.execute(new RefreshSessionCommand('refresh-1'))).rejects.toThrow();
  });
});
