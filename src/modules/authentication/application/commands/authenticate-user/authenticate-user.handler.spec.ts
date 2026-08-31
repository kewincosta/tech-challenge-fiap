import { describe, expect, it } from 'vitest';
import { stubEventBus, stubQueryBus } from '../../../../../../test/support/fakes/bus.stubs';
import { FakeAccessTokenService } from '../../../../../../test/support/fakes/fake-access-token.service';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { FakeIdGenerator } from '../../../../../../test/support/fakes/fake-id-generator';
import { FakeRefreshTokenHasher } from '../../../../../../test/support/fakes/fake-refresh-token-hasher';
import { InMemorySessionRepository } from '../../../../../../test/support/fakes/in-memory-session.repository';
import { InvalidCredentialsError } from '../../../domain/errors/invalid-credentials.error';
import { SessionStatus } from '../../../domain/session-status';
import { AuthenticateUserCommand } from './authenticate-user.command';
import { AuthenticateUserHandler } from './authenticate-user.handler';

const AUTH_CONFIG = {
  jwtSecret: 'test-secret',
  accessTokenTtlSeconds: 900,
  refreshTokenTtlSeconds: 604800,
  sessionAbsoluteTtlSeconds: 2592000,
};

function makeHandler() {
  const sessions = new InMemorySessionRepository();
  const queryBus = stubQueryBus();
  const eventBus = stubEventBus();
  const handler = new AuthenticateUserHandler(
    sessions,
    new FakeAccessTokenService(),
    new FakeRefreshTokenHasher(),
    new FakeIdGenerator(),
    new FakeClock(),
    AUTH_CONFIG,
    queryBus.bus,
    eventBus.bus,
  );
  return { handler, sessions, queryBus, eventBus };
}

describe('AuthenticateUserHandler', () => {
  it('should create a session and return an access and refresh token pair', async () => {
    const { handler, sessions, queryBus } = makeHandler();
    queryBus.execute.mockResolvedValue({ userId: '11111111-1111-4111-8111-111111111111' });

    const result = await handler.execute(
      new AuthenticateUserCommand('jane@example.com', 'Str0ngPassword', '127.0.0.1', 'vitest'),
    );

    const session = sessions.sessions[0];
    expect(session.userId).toBe('11111111-1111-4111-8111-111111111111');
    expect(session.status).toBe(SessionStatus.Active);
    expect(result.sessionId).toBe(session.id.value);
    expect(result.tokenType).toBe('Bearer');
    expect(result.expiresInSeconds).toBe(900);
    expect(result.refreshToken).not.toHaveLength(0);
  });

  it('should store only the hash of the refresh token', async () => {
    const { handler, sessions, queryBus } = makeHandler();
    queryBus.execute.mockResolvedValue({ userId: '11111111-1111-4111-8111-111111111111' });

    const result = await handler.execute(
      new AuthenticateUserCommand('jane@example.com', 'Str0ngPassword', null, null),
    );

    const storedHash = sessions.sessions[0].activeToken.tokenHash.value;
    expect(storedHash).toBe(`hash(${result.refreshToken})`);
    expect(storedHash).not.toContain(result.refreshToken.slice(0, 8) + '-plain');
  });

  it('should reject invalid credentials without creating a session', async () => {
    const { handler, sessions, queryBus } = makeHandler();
    queryBus.execute.mockResolvedValue(null);

    await expect(
      handler.execute(
        new AuthenticateUserCommand('jane@example.com', 'WrongPassword1', null, null),
      ),
    ).rejects.toThrow(InvalidCredentialsError);
    expect(sessions.sessions).toHaveLength(0);
  });
});
