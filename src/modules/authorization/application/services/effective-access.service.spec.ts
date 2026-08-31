import { describe, expect, it, vi } from 'vitest';
import { FakeAccessCache } from '../../../../../test/support/fakes/fake-access-cache';
import { EffectiveAccessReader } from '../ports/effective-access-reader.port';
import { EffectiveAccessService } from './effective-access.service';

const USER_ID = '11111111-1111-4111-8111-111111111111';

function makeService(access = { roles: ['CUSTOMER'], permissions: ['users:read'] }) {
  const cache = new FakeAccessCache();
  const read = vi.fn().mockResolvedValue(access);
  const reader: EffectiveAccessReader = { read };
  return { service: new EffectiveAccessService(cache, reader), cache, read };
}

describe('EffectiveAccessService', () => {
  it('should read the effective access from the database and cache it', async () => {
    const { service, cache, read } = makeService();

    const access = await service.getEffectiveAccess(USER_ID);

    expect(access.permissions).toEqual(['users:read']);
    expect(await cache.get(USER_ID)).toEqual(access);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('should serve a second read from the cache', async () => {
    const { service, read } = makeService();

    await service.getEffectiveAccess(USER_ID);
    await service.getEffectiveAccess(USER_ID);

    expect(read).toHaveBeenCalledTimes(1);
  });

  it('should read again after the cache is invalidated', async () => {
    const { service, read } = makeService();
    await service.getEffectiveAccess(USER_ID);

    await service.invalidate(USER_ID);
    await service.getEffectiveAccess(USER_ID);

    expect(read).toHaveBeenCalledTimes(2);
  });
});
