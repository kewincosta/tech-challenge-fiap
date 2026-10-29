import { describe, expect, it } from 'vitest';
import { FakeRbacQuery } from '../../../../../../../test/support/fakes/fake-rbac-query';
import { PermissionDto } from '../../ports/rbac-query.port';
import { ListPermissionsUseCase } from './list-permissions.use-case';
import { ListPermissionsQuery } from './list-permissions.query';

const ROLES_READ: PermissionDto = {
  id: '11111111-1111-4111-8111-111111111111',
  code: 'roles:read',
  description: 'Read roles',
};
const USERS_READ: PermissionDto = {
  id: '22222222-2222-4222-8222-222222222222',
  code: 'users:read',
  description: null,
};

describe('ListPermissionsUseCase', () => {
  it('lists the permission catalog the port holds, in the order it gives it', async () => {
    const handler = new ListPermissionsUseCase(
      new FakeRbacQuery().withPermissions([ROLES_READ, USERS_READ]),
    );

    const permissions = await handler.execute(new ListPermissionsQuery());

    expect(permissions).toEqual([ROLES_READ, USERS_READ]);
  });
});
