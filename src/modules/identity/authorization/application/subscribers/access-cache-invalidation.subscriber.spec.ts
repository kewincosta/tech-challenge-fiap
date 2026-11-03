import { describe, expect, it } from 'vitest';
import { FakeAccessCache } from '../../../../../../test/support/fakes/fake-access-cache';
import { FakeEffectiveAccessReader } from '../../../../../../test/support/fakes/fake-effective-access-reader';
import { RoleAssignedToUser } from '../../domain/events/role-assigned-to-user.event';
import { RoleRevokedFromUser } from '../../domain/events/role-revoked-from-user.event';
import { EffectiveAccessService } from '../services/effective-access.service';
import { AccessCacheInvalidationSubscriber } from './access-cache-invalidation.subscriber';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
const ROLE_ID = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2026-09-01T09:00:00.000Z');

// Both users have their effective access cached before the event arrives.
async function makeSubscriber() {
  const cache = new FakeAccessCache();
  const reader = new FakeEffectiveAccessReader()
    .withAccess(USER_ID, { roles: ['CUSTOMER'] })
    .withAccess(OTHER_USER_ID, { roles: ['MECHANIC'] });
  const service = new EffectiveAccessService(cache, reader);
  await service.getEffectiveAccess(USER_ID);
  await service.getEffectiveAccess(OTHER_USER_ID);
  return { subscriber: new AccessCacheInvalidationSubscriber(service), cache };
}

describe('AccessCacheInvalidationSubscriber', () => {
  it('drops the cached access of the user a role was assigned to, and of nobody else', async () => {
    const { subscriber, cache } = await makeSubscriber();

    await subscriber.handle(new RoleAssignedToUser(USER_ID, ROLE_ID, 'MECHANIC', NOW));

    expect(await cache.get(USER_ID)).toBeNull();
    expect(await cache.get(OTHER_USER_ID)).toEqual({ roles: ['MECHANIC'], permissions: [] });
  });

  it('drops the cached access of the user a role was revoked from, and of nobody else', async () => {
    const { subscriber, cache } = await makeSubscriber();

    await subscriber.handle(new RoleRevokedFromUser(USER_ID, ROLE_ID, NOW));

    expect(await cache.get(USER_ID)).toBeNull();
    expect(await cache.get(OTHER_USER_ID)).toEqual({ roles: ['MECHANIC'], permissions: [] });
  });
});
