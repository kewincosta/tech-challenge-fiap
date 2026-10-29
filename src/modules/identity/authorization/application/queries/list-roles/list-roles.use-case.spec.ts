import { describe, expect, it } from 'vitest';
import { FakeRbacQuery } from '../../../../../../../test/support/fakes/fake-rbac-query';
import { RoleDto } from '../../ports/rbac-query.port';
import { ListRolesUseCase } from './list-roles.use-case';
import { ListRolesQuery } from './list-roles.query';

const ADMIN: RoleDto = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'ADMIN',
  description: null,
  isSystem: true,
  permissions: ['users:manage'],
};
const MECHANIC: RoleDto = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'MECHANIC',
  description: 'Works on the vehicles',
  isSystem: true,
  permissions: [],
};

describe('ListRolesUseCase', () => {
  it('lists the roles the port holds, in the order it gives them', async () => {
    const handler = new ListRolesUseCase(new FakeRbacQuery().withRoles([ADMIN, MECHANIC]));

    const roles = await handler.execute(new ListRolesQuery());

    expect(roles).toEqual([ADMIN, MECHANIC]);
  });
});
