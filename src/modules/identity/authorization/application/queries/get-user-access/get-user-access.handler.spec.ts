import { describe, expect, it } from 'vitest';
import { FailingUserRepository } from '../../../../../../../test/support/fakes/failing-user.repository';
import { FakeRbacQuery } from '../../../../../../../test/support/fakes/fake-rbac-query';
import { InMemoryUserRepository } from '../../../../../../../test/support/fakes/in-memory-user.repository';
import { buildUser } from '../../../../../../../test/support/factories/user.factory';
import { GetUserByIdHandler } from '../../../../users/application/queries/get-user-by-id/get-user-by-id.handler';
import { AssignedUserNotFoundError } from '../../../domain/errors/assigned-user-not-found.error';
import { UserAccessDto } from '../../ports/rbac-query.port';
import { GetUserAccessHandler } from './get-user-access.handler';
import { GetUserAccessQuery } from './get-user-access.query';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const UNKNOWN_ID = '22222222-2222-4222-8222-222222222222';
const ACCESS: UserAccessDto = {
  roles: [
    { id: '33333333-3333-4333-8333-333333333333', name: 'CUSTOMER' },
    { id: '44444444-4444-4444-8444-444444444444', name: 'MECHANIC' },
  ],
};

async function makeHandler(lookupFailure?: Error) {
  const users = lookupFailure
    ? new FailingUserRepository(lookupFailure)
    : new InMemoryUserRepository();
  await users.save(buildUser({ id: USER_ID }));
  // The port holds an access for the unknown id too, so only the user check can refuse it.
  const rbacQuery = new FakeRbacQuery()
    .withUserAccess(USER_ID, ACCESS)
    .withUserAccess(UNKNOWN_ID, ACCESS);
  return new GetUserAccessHandler(rbacQuery, new GetUserByIdHandler(users));
}

describe('GetUserAccessHandler', () => {
  it('returns the roles the port holds for a user that exists', async () => {
    const handler = await makeHandler();

    const access = await handler.execute(new GetUserAccessQuery(USER_ID));

    expect(access).toEqual(ACCESS);
  });

  it('refuses a user that does not exist with the user not-found error, whatever the port holds', async () => {
    const handler = await makeHandler();

    await expect(handler.execute(new GetUserAccessQuery(UNKNOWN_ID))).rejects.toThrow(
      AssignedUserNotFoundError,
    );
  });

  it('does not report a failure of the user lookup as an unknown user', async () => {
    const failure = new Error('database is down');
    const handler = await makeHandler(failure);

    await expect(handler.execute(new GetUserAccessQuery(USER_ID))).rejects.toBe(failure);
  });
});
