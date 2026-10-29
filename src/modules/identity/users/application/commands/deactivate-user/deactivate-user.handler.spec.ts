import { describe, expect, it } from 'vitest';
import { stubEventBus } from '../../../../../../../test/support/fakes/bus.stubs';
import { FakeClock } from '../../../../../../../test/support/fakes/fake-clock';
import { FakeRevokedSessionStore } from '../../../../../../../test/support/fakes/fake-revoked-session-store';
import { InMemorySessionRepository } from '../../../../../../../test/support/fakes/in-memory-session.repository';
import { InMemoryUserRepository } from '../../../../../../../test/support/fakes/in-memory-user.repository';
import { RecordingDomainEventPublisher } from '../../../../../../../test/support/fakes/recording-domain-event-publisher';
import { buildSession } from '../../../../../../../test/support/factories/session.factory';
import { buildUser } from '../../../../../../../test/support/factories/user.factory';
import { LogoutAllSessionsHandler } from '../../../../authentication/application/commands/logout-all-sessions/logout-all-sessions.handler';
import { SessionStatus } from '../../../../authentication/domain/session-status';
import { UserNotFoundError } from '../../../domain/errors/user-not-found.error';
import { UserStatus } from '../../../domain/user-status';
import { DeactivateUserCommand } from './deactivate-user.command';
import { DeactivateUserHandler } from './deactivate-user.handler';

// Ending the sessions is the real use case over the in-memory sessions.
function makeHandler() {
  const users = new InMemoryUserRepository();
  const sessions = new InMemorySessionRepository();
  const revokedSessions = new FakeRevokedSessionStore();
  const eventBus = stubEventBus();
  const clock = new FakeClock();
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
  const handler = new DeactivateUserHandler(users, clock, eventBus.bus, logoutAllSessions);
  return { handler, users, sessions, revokedSessions, eventBus, clock };
}

describe('DeactivateUserHandler', () => {
  it('should deactivate the user and soft delete it', async () => {
    const { handler, users, clock } = makeHandler();
    const user = buildUser({ email: 'jane@example.com', document: '11144477735' });
    await users.save(user);

    await handler.execute(new DeactivateUserCommand(user.id.value));

    const saved = users.users.find((u) => u.id.equals(user.id));
    expect(saved?.status).toBe(UserStatus.Inactive);
    expect(saved?.deletedAt).toEqual(clock.now());
  });

  it('should free the email and document for reuse by a new registration', async () => {
    const { handler, users } = makeHandler();
    const user = buildUser({ email: 'jane@example.com', document: '11144477735' });
    await users.save(user);

    await handler.execute(new DeactivateUserCommand(user.id.value));

    const newUser = buildUser({ email: 'jane@example.com', document: '11144477735' });
    expect(await users.existsByEmail(newUser.email)).toBe(false);
    expect(await users.existsByDocument(newUser.document)).toBe(false);
  });

  it('should throw when the user does not exist', async () => {
    const { handler } = makeHandler();

    await expect(
      handler.execute(new DeactivateUserCommand('00000000-0000-4000-8000-000000000001')),
    ).rejects.toThrow(UserNotFoundError);
  });

  it('should revoke every active session of the deactivated user', async () => {
    const { handler, users, sessions, revokedSessions } = makeHandler();
    const user = buildUser({ email: 'jane@example.com', document: '11144477735' });
    await users.save(user);
    const session = buildSession({ userId: user.id.value });
    const foreignSession = buildSession();
    await sessions.save(session);
    await sessions.save(foreignSession);

    await handler.execute(new DeactivateUserCommand(user.id.value));

    expect(session.status).toBe(SessionStatus.Revoked);
    expect(await revokedSessions.isRevoked(session.id.value)).toBe(true);
    expect(foreignSession.status).toBe(SessionStatus.Active);
  });
});
