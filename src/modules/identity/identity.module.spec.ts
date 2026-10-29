import { describe, expect, it } from 'vitest';
import { FakeAccessCache } from '../../../test/support/fakes/fake-access-cache';
import { FakeEffectiveAccessReader } from '../../../test/support/fakes/fake-effective-access-reader';
import { InMemoryDomainEventDispatcher } from '../../shared/infrastructure/events/in-memory-domain-event-dispatcher';
import { EffectiveAccessService } from './authorization/application/services/effective-access.service';
import { AccessCacheInvalidationSubscriber } from './authorization/application/subscribers/access-cache-invalidation.subscriber';
import { RoleAssignedToUser } from './authorization/domain/events/role-assigned-to-user.event';
import { RoleRevokedFromUser } from './authorization/domain/events/role-revoked-from-user.event';
import { IdentityModule } from './identity.module';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ROLE_ID = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-09-01T09:00:00.000Z');

// Lets the callbacks of a promise that is already resolved run.
const flushPromises = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

// The module starts the way Nest starts it: its constructor gets the dispatcher and the
// subscribers, then `onModuleInit` runs. The user's effective access is cached before any event.
async function startModule() {
  const dispatcher = new InMemoryDomainEventDispatcher();
  const cache = new FakeAccessCache();
  const reader = new FakeEffectiveAccessReader().withAccess(USER_ID, { roles: ['CUSTOMER'] });
  const service = new EffectiveAccessService(cache, reader);
  await service.getEffectiveAccess(USER_ID);
  new IdentityModule(dispatcher, new AccessCacheInvalidationSubscriber(service)).onModuleInit();
  return { dispatcher, cache };
}

describe('IdentityModule', () => {
  it('drops the cached access of a user when a role is assigned to them', async () => {
    const { dispatcher, cache } = await startModule();

    dispatcher.publish([new RoleAssignedToUser(USER_ID, ROLE_ID, 'MECHANIC', NOW)]);
    await flushPromises();

    expect(await cache.get(USER_ID)).toBeNull();
  });

  it('drops the cached access of a user when a role is revoked from them', async () => {
    const { dispatcher, cache } = await startModule();

    dispatcher.publish([new RoleRevokedFromUser(USER_ID, ROLE_ID, NOW)]);
    await flushPromises();

    expect(await cache.get(USER_ID)).toBeNull();
  });
});
