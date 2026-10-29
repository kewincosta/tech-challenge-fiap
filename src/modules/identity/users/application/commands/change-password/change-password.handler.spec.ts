import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../../../../../../test/support/fakes/fake-clock';
import { FakePasswordHasher } from '../../../../../../../test/support/fakes/fake-password-hasher';
import { FakeRevokedSessionStore } from '../../../../../../../test/support/fakes/fake-revoked-session-store';
import { InMemorySessionRepository } from '../../../../../../../test/support/fakes/in-memory-session.repository';
import { InMemoryUserRepository } from '../../../../../../../test/support/fakes/in-memory-user.repository';
import { RecordingDomainEventPublisher } from '../../../../../../../test/support/fakes/recording-domain-event-publisher';
import { buildSession } from '../../../../../../../test/support/factories/session.factory';
import { buildUser } from '../../../../../../../test/support/factories/user.factory';
import { LogoutAllSessionsHandler } from '../../../../authentication/application/commands/logout-all-sessions/logout-all-sessions.handler';
import { InvalidCredentialsError } from '../../../../authentication/domain/errors/invalid-credentials.error';
import { SessionStatus } from '../../../../authentication/domain/session-status';
import { WeakPasswordError } from '../../../domain/errors/weak-password.error';
import { ChangePasswordCommand } from './change-password.command';
import { ChangePasswordHandler } from './change-password.handler';

// Ending the sessions is the real use case over the in-memory sessions.
function makeHandler() {
  const users = new InMemoryUserRepository();
  const passwordHasher = new FakePasswordHasher();
  const clock = new FakeClock();
  const sessions = new InMemorySessionRepository();
  const revokedSessions = new FakeRevokedSessionStore();
  const logoutAllSessions = new LogoutAllSessionsHandler(
    sessions,
    revokedSessions,
    clock,
    {
      accessTokenTtlSeconds: 900,
      refreshTokenTtlSeconds: 604800,
      sessionAbsoluteTtlSeconds: 2592000,
    },
    new RecordingDomainEventPublisher(),
  );
  const handler = new ChangePasswordHandler(users, passwordHasher, clock, logoutAllSessions);
  return { handler, users, passwordHasher, clock, sessions, revokedSessions };
}

describe('ChangePasswordHandler', () => {
  it('should change the password when the current password matches', async () => {
    const { handler, users } = makeHandler();
    const user = buildUser({ passwordHash: 'hashed:OldPassword1' });
    await users.save(user);

    await handler.execute(new ChangePasswordCommand(user.id.value, 'OldPassword1', 'NewPassword2'));

    const saved = users.users.find((u) => u.id.equals(user.id));
    expect(saved?.passwordHash.value).toBe('hashed:NewPassword2');
  });

  it('should reject a wrong current password', async () => {
    const { handler, users } = makeHandler();
    const user = buildUser({ passwordHash: 'hashed:OldPassword1' });
    await users.save(user);

    await expect(
      handler.execute(new ChangePasswordCommand(user.id.value, 'WrongPassword1', 'NewPassword2')),
    ).rejects.toThrow(InvalidCredentialsError);
  });

  it('should reject a weak new password', async () => {
    const { handler, users } = makeHandler();
    const user = buildUser({ passwordHash: 'hashed:OldPassword1' });
    await users.save(user);

    await expect(
      handler.execute(new ChangePasswordCommand(user.id.value, 'OldPassword1', 'short')),
    ).rejects.toThrow(WeakPasswordError);
  });

  it('should clear the pending password flag on success', async () => {
    const { handler, users } = makeHandler();
    const user = buildUser({ passwordHash: 'hashed:OldPassword1', temporary: true });
    await users.save(user);

    await handler.execute(new ChangePasswordCommand(user.id.value, 'OldPassword1', 'NewPassword2'));

    const saved = users.users.find((u) => u.id.equals(user.id));
    expect(saved?.mustChangePassword).toBe(false);
  });

  it('should revoke every session of the user on success', async () => {
    const { handler, users, sessions, revokedSessions } = makeHandler();
    const user = buildUser({ passwordHash: 'hashed:OldPassword1' });
    await users.save(user);
    const session = buildSession({ userId: user.id.value });
    const foreignSession = buildSession();
    await sessions.save(session);
    await sessions.save(foreignSession);

    await handler.execute(new ChangePasswordCommand(user.id.value, 'OldPassword1', 'NewPassword2'));

    expect(session.status).toBe(SessionStatus.Revoked);
    expect(await revokedSessions.isRevoked(session.id.value)).toBe(true);
    expect(foreignSession.status).toBe(SessionStatus.Active);
  });
});
