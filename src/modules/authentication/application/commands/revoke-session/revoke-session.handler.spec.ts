import { describe, expect, it } from 'vitest';
import { stubEventBus, stubQueryBus } from '../../../../../../test/support/fakes/bus.stubs';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { FakeRevokedSessionStore } from '../../../../../../test/support/fakes/fake-revoked-session-store';
import { InMemorySessionRepository } from '../../../../../../test/support/fakes/in-memory-session.repository';
import { buildSession } from '../../../../../../test/support/factories/session.factory';
import { AppPermission } from '../../../../authorization/application/contracts/app-permissions';
import { SessionNotFoundError } from '../../../domain/errors/session-not-found.error';
import { SessionRevocationReason } from '../../../domain/session-revocation-reason';
import { SessionStatus } from '../../../domain/session-status';
import { RevokeSessionCommand } from './revoke-session.command';
import { RevokeSessionHandler } from './revoke-session.handler';

const AUTH_CONFIG = {
  jwtSecret: 'test-secret',
  accessTokenTtlSeconds: 900,
  refreshTokenTtlSeconds: 604800,
  sessionAbsoluteTtlSeconds: 2592000,
};

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';

function makeHandler() {
  const sessions = new InMemorySessionRepository();
  const revokedSessions = new FakeRevokedSessionStore();
  const queryBus = stubQueryBus();
  const eventBus = stubEventBus();
  const handler = new RevokeSessionHandler(
    sessions,
    revokedSessions,
    new FakeClock(),
    AUTH_CONFIG,
    queryBus.bus,
    eventBus.bus,
  );
  return { handler, sessions, revokedSessions, queryBus };
}

describe('RevokeSessionHandler', () => {
  it('should revoke a session owned by the actor', async () => {
    const { handler, sessions, queryBus } = makeHandler();
    const session = buildSession({ userId: OWNER_ID });
    await sessions.save(session);

    await handler.execute(new RevokeSessionCommand(session.id.value, OWNER_ID));

    expect(session.status).toBe(SessionStatus.Revoked);
    expect(queryBus.execute).not.toHaveBeenCalled();
  });

  it('should revoke a foreign session when the actor can revoke any session', async () => {
    const { handler, sessions, queryBus } = makeHandler();
    const session = buildSession({ userId: OWNER_ID });
    await sessions.save(session);
    queryBus.execute.mockResolvedValue({
      roles: ['ADMIN'],
      permissions: [AppPermission.SessionsRevokeAny],
    });

    await handler.execute(new RevokeSessionCommand(session.id.value, OTHER_ID));

    expect(session.status).toBe(SessionStatus.Revoked);
    expect(session.revocationReason).toBe(SessionRevocationReason.AdminRevocation);
  });

  it('should not reveal a foreign session to an actor without permission', async () => {
    const { handler, sessions, queryBus } = makeHandler();
    const session = buildSession({ userId: OWNER_ID });
    await sessions.save(session);
    queryBus.execute.mockResolvedValue({ roles: ['CUSTOMER'], permissions: [] });

    await expect(
      handler.execute(new RevokeSessionCommand(session.id.value, OTHER_ID)),
    ).rejects.toThrow(SessionNotFoundError);
    expect(session.status).toBe(SessionStatus.Active);
  });

  it('should not revoke an unknown session', async () => {
    const { handler } = makeHandler();

    await expect(
      handler.execute(new RevokeSessionCommand('33333333-3333-4333-8333-333333333333', OWNER_ID)),
    ).rejects.toThrow(SessionNotFoundError);
  });
});
