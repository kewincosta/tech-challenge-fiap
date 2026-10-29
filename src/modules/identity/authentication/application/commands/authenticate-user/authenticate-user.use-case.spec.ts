import { describe, expect, it } from 'vitest';
import { FakeAccessTokenService } from '../../../../../../../test/support/fakes/fake-access-token.service';
import { FakeClock } from '../../../../../../../test/support/fakes/fake-clock';
import { FailingUserRepository } from '../../../../../../../test/support/fakes/failing-user.repository';
import { FakeIdGenerator } from '../../../../../../../test/support/fakes/fake-id-generator';
import { FakePasswordHasher } from '../../../../../../../test/support/fakes/fake-password-hasher';
import { FakeRefreshTokenHasher } from '../../../../../../../test/support/fakes/fake-refresh-token-hasher';
import { InMemorySessionRepository } from '../../../../../../../test/support/fakes/in-memory-session.repository';
import { InMemoryUserRepository } from '../../../../../../../test/support/fakes/in-memory-user.repository';
import { RecordingDomainEventPublisher } from '../../../../../../../test/support/fakes/recording-domain-event-publisher';
import { buildUser } from '../../../../../../../test/support/factories/user.factory';
import { GetUserByIdUseCase } from '../../../../users/application/queries/get-user-by-id/get-user-by-id.use-case';
import { VerifyCredentialsUseCase } from '../../../../users/application/queries/verify-credentials/verify-credentials.use-case';
import { InvalidCredentialsError } from '../../../domain/errors/invalid-credentials.error';
import { SessionCreated } from '../../../domain/events/session-created.event';
import { SessionStatus } from '../../../domain/session-status';
import { AuthSettings } from '../../auth-settings';
import { AuthenticateUserCommand } from './authenticate-user.command';
import { AuthenticateUserUseCase } from './authenticate-user.use-case';

const USER_ID = '11111111-1111-4111-8111-111111111111';

const SETTINGS: AuthSettings = {
  accessTokenTtlSeconds: 900,
  refreshTokenTtlSeconds: 604800,
  sessionAbsoluteTtlSeconds: 2592000,
};

// The account is found by e-mail but no longer by id, as when it is deactivated between the two
// reads that a login makes.
class VanishingUsers extends InMemoryUserRepository {
  override async findById(): Promise<null> {
    return Promise.resolve(null);
  }
}

// The user and the credential check are the real use cases over the in-memory users: Jane signs in
// with Str0ngPassword, and her account is pending a password change when a case says so.
async function makeHandler(
  options: {
    mustChangePassword?: boolean;
    settings?: AuthSettings;
    accountVanishes?: boolean;
    lookupFailure?: Error;
  } = {},
) {
  let users = new InMemoryUserRepository();
  if (options.accountVanishes) {
    users = new VanishingUsers();
  }
  if (options.lookupFailure) {
    users = new FailingUserRepository(options.lookupFailure);
  }
  await users.save(
    buildUser({
      id: USER_ID,
      email: 'jane@example.com',
      passwordHash: 'hashed:Str0ngPassword',
      temporary: options.mustChangePassword,
    }),
  );
  const sessions = new InMemorySessionRepository();
  const events = new RecordingDomainEventPublisher();
  const clock = new FakeClock();
  const handler = new AuthenticateUserUseCase(
    sessions,
    new FakeAccessTokenService(),
    new FakeRefreshTokenHasher(),
    new FakeIdGenerator(),
    clock,
    options.settings ?? SETTINGS,
    new VerifyCredentialsUseCase(users, new FakePasswordHasher()),
    new GetUserByIdUseCase(users),
    events,
  );
  return { handler, sessions, events, clock };
}

describe('AuthenticateUserUseCase', () => {
  it('should create a session and return an access and refresh token pair', async () => {
    const { handler, sessions, events, clock } = await makeHandler();

    const result = await handler.execute(
      new AuthenticateUserCommand('jane@example.com', 'Str0ngPassword', '127.0.0.1', 'vitest'),
    );

    const session = sessions.sessions[0];
    expect(session.userId).toBe(USER_ID);
    expect(session.status).toBe(SessionStatus.Active);
    expect(result.sessionId).toBe(session.id.value);
    expect(result.tokenType).toBe('Bearer');
    expect(result.expiresInSeconds).toBe(900);
    expect(result.refreshToken).not.toHaveLength(0);
    expect(events.published).toEqual([new SessionCreated(session.id.value, USER_ID, clock.now())]);
  });

  it('should embed the pending password flag in the issued access token', async () => {
    const { handler } = await makeHandler({ mustChangePassword: true });

    const result = await handler.execute(
      new AuthenticateUserCommand('jane@example.com', 'Str0ngPassword', null, null),
    );

    expect(result.accessToken.endsWith(':true')).toBe(true);
  });

  it('should store only the hash of the refresh token', async () => {
    const { handler, sessions } = await makeHandler();

    const result = await handler.execute(
      new AuthenticateUserCommand('jane@example.com', 'Str0ngPassword', null, null),
    );

    const storedHash = sessions.sessions[0].activeToken.tokenHash.value;
    expect(storedHash).toBe(`hash(${result.refreshToken})`);
    expect(storedHash).not.toContain(result.refreshToken.slice(0, 8) + '-plain');
  });

  it('should reject invalid credentials without creating a session', async () => {
    const { handler, sessions, events } = await makeHandler();

    await expect(
      handler.execute(
        new AuthenticateUserCommand('jane@example.com', 'WrongPassword1', null, null),
      ),
    ).rejects.toThrow(InvalidCredentialsError);
    expect(sessions.sessions).toHaveLength(0);
    expect(events.published).toEqual([]);
  });

  it('should answer an account that went away after the credential check as invalid credentials', async () => {
    const { handler, sessions, events } = await makeHandler({ accountVanishes: true });

    await expect(
      handler.execute(
        new AuthenticateUserCommand('jane@example.com', 'Str0ngPassword', null, null),
      ),
    ).rejects.toThrow(InvalidCredentialsError);
    expect(sessions.sessions).toHaveLength(0);
    expect(events.published).toEqual([]);
  });

  it('should not report a failure of the account lookup as invalid credentials', async () => {
    const failure = new Error('database is down');
    const { handler, sessions } = await makeHandler({ lookupFailure: failure });

    await expect(
      handler.execute(
        new AuthenticateUserCommand('jane@example.com', 'Str0ngPassword', null, null),
      ),
    ).rejects.toBe(failure);
    expect(sessions.sessions).toHaveLength(0);
  });

  it('should expire the refresh token and the session after the lifetimes of the settings', async () => {
    const { handler, sessions, clock } = await makeHandler({
      settings: {
        accessTokenTtlSeconds: 111,
        refreshTokenTtlSeconds: 600,
        sessionAbsoluteTtlSeconds: 2000,
      },
    });

    const result = await handler.execute(
      new AuthenticateUserCommand('jane@example.com', 'Str0ngPassword', null, null),
    );

    expect(result.refreshTokenExpiresAt).toBe(
      new Date(clock.now().getTime() + 600 * 1000).toISOString(),
    );
    expect(sessions.sessions[0].absoluteExpiresAt).toEqual(
      new Date(clock.now().getTime() + 2000 * 1000),
    );
  });
});
