import { describe, expect, it } from 'vitest';
import { FakeAccessCache } from '../../../../../../../test/support/fakes/fake-access-cache';
import { FakeClock } from '../../../../../../../test/support/fakes/fake-clock';
import { FakeEffectiveAccessReader } from '../../../../../../../test/support/fakes/fake-effective-access-reader';
import { FakeRevokedSessionStore } from '../../../../../../../test/support/fakes/fake-revoked-session-store';
import { InMemorySessionRepository } from '../../../../../../../test/support/fakes/in-memory-session.repository';
import { RecordingDomainEventPublisher } from '../../../../../../../test/support/fakes/recording-domain-event-publisher';
import { buildSession } from '../../../../../../../test/support/factories/session.factory';
import { AppPermission } from '../../../../authorization/application/contracts/app-permissions';
import { GetUserEffectiveAccessHandler } from '../../../../authorization/application/queries/get-user-effective-access/get-user-effective-access.handler';
import { EffectiveAccessService } from '../../../../authorization/application/services/effective-access.service';
import { SessionNotFoundError } from '../../../domain/errors/session-not-found.error';
import { SessionRevoked } from '../../../domain/events/session-revoked.event';
import { SessionRevocationReason } from '../../../domain/session-revocation-reason';
import { SessionStatus } from '../../../domain/session-status';
import { AuthSettings } from '../../auth-settings';
import { RevokeSessionCommand } from './revoke-session.command';
import { RevokeSessionHandler } from './revoke-session.handler';

const SETTINGS: AuthSettings = {
  accessTokenTtlSeconds: 900,
  refreshTokenTtlSeconds: 604800,
  sessionAbsoluteTtlSeconds: 2592000,
};

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';

function makeHandler(settings: AuthSettings = SETTINGS) {
  const sessions = new InMemorySessionRepository();
  const revokedSessions = new FakeRevokedSessionStore();
  const access = new FakeEffectiveAccessReader();
  const events = new RecordingDomainEventPublisher();
  const clock = new FakeClock();
  const handler = new RevokeSessionHandler(
    sessions,
    revokedSessions,
    clock,
    settings,
    new GetUserEffectiveAccessHandler(new EffectiveAccessService(new FakeAccessCache(), access)),
    events,
  );
  return { handler, sessions, revokedSessions, access, events, clock };
}

// A stored session has no pending events, like one the repository loaded.
function storedSession() {
  const session = buildSession({ userId: OWNER_ID });
  session.pullDomainEvents();
  return session;
}

describe('RevokeSessionHandler', () => {
  it('should revoke a session owned by the actor', async () => {
    const { handler, sessions, revokedSessions, access, events, clock } = makeHandler();
    const session = storedSession();
    await sessions.save(session);

    await handler.execute(new RevokeSessionCommand(session.id.value, OWNER_ID));

    expect(session.status).toBe(SessionStatus.Revoked);
    expect(access.reads).toEqual([]);
    expect(await revokedSessions.isRevoked(session.id.value)).toBe(true);
    expect(events.published).toEqual([
      new SessionRevoked(session.id.value, OWNER_ID, SessionRevocationReason.Logout, clock.now()),
    ]);
  });

  it('should revoke a foreign session when the actor can revoke any session', async () => {
    const { handler, sessions, access, events, clock } = makeHandler();
    const session = storedSession();
    await sessions.save(session);
    access.withAccess(OTHER_ID, {
      roles: ['ADMIN'],
      permissions: [AppPermission.SessionsRevokeAny],
    });

    await handler.execute(new RevokeSessionCommand(session.id.value, OTHER_ID));

    expect(session.status).toBe(SessionStatus.Revoked);
    expect(session.revocationReason).toBe(SessionRevocationReason.AdminRevocation);
    expect(events.published).toEqual([
      new SessionRevoked(
        session.id.value,
        OWNER_ID,
        SessionRevocationReason.AdminRevocation,
        clock.now(),
      ),
    ]);
  });

  it('should not reveal a foreign session to an actor without permission', async () => {
    const { handler, sessions, access, events } = makeHandler();
    const session = storedSession();
    await sessions.save(session);
    access.withAccess(OTHER_ID, { roles: ['CUSTOMER'] });

    await expect(
      handler.execute(new RevokeSessionCommand(session.id.value, OTHER_ID)),
    ).rejects.toThrow(SessionNotFoundError);
    expect(session.status).toBe(SessionStatus.Active);
    expect(events.published).toEqual([]);
  });

  it('should not revoke an unknown session', async () => {
    const { handler } = makeHandler();

    await expect(
      handler.execute(new RevokeSessionCommand('33333333-3333-4333-8333-333333333333', OWNER_ID)),
    ).rejects.toThrow(SessionNotFoundError);
  });

  it('should keep the revoked session marked for the access token lifetime of the settings', async () => {
    const { handler, sessions, revokedSessions } = makeHandler({
      accessTokenTtlSeconds: 111,
      refreshTokenTtlSeconds: 600,
      sessionAbsoluteTtlSeconds: 2000,
    });
    const session = storedSession();
    await sessions.save(session);

    await handler.execute(new RevokeSessionCommand(session.id.value, OWNER_ID));

    expect(revokedSessions.ttlSeconds.get(session.id.value)).toBe(111);
  });
});
