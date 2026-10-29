import { describe, expect, it } from 'vitest';
import { FakeAccessCache } from '../../../../../../../test/support/fakes/fake-access-cache';
import { FakeEffectiveAccessReader } from '../../../../../../../test/support/fakes/fake-effective-access-reader';
import { EffectiveAccessService } from '../../services/effective-access.service';
import { GetUserEffectiveAccessHandler } from './get-user-effective-access.handler';
import { GetUserEffectiveAccessQuery } from './get-user-effective-access.query';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';

function makeHandler() {
  const reader = new FakeEffectiveAccessReader()
    .withAccess(USER_ID, { roles: ['MECHANIC'], permissions: ['inventory:read'] })
    .withAccess(OTHER_ID, { roles: ['ADMIN'], permissions: ['users:manage'] });
  return new GetUserEffectiveAccessHandler(
    new EffectiveAccessService(new FakeAccessCache(), reader),
  );
}

describe('GetUserEffectiveAccessHandler', () => {
  it('returns the roles and permissions of the user asked for, and nobody else', async () => {
    const handler = makeHandler();

    const access = await handler.execute(new GetUserEffectiveAccessQuery(USER_ID));

    expect(access).toEqual({ roles: ['MECHANIC'], permissions: ['inventory:read'] });
  });
});
