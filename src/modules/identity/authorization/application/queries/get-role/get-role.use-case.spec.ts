import { describe, expect, it } from 'vitest';
import { FakeRbacQuery } from '../../../../../../../test/support/fakes/fake-rbac-query';
import { RoleNotFoundError } from '../../../domain/errors/role-not-found.error';
import { RoleDto } from '../../ports/rbac-query.port';
import { GetRoleUseCase } from './get-role.use-case';
import { GetRoleQuery } from './get-role.query';

const MANAGER: RoleDto = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'WORKSHOP_MANAGER',
  description: 'Manages the workshop',
  isSystem: false,
  permissions: ['roles:read', 'users:read'],
};
const UNKNOWN_ID = '22222222-2222-4222-8222-222222222222';

describe('GetRoleUseCase', () => {
  it('returns the role the port holds, with its permissions', async () => {
    const handler = new GetRoleUseCase(new FakeRbacQuery().withRoles([MANAGER]));

    const role = await handler.execute(new GetRoleQuery(MANAGER.id));

    expect(role).toEqual(MANAGER);
  });

  it('refuses an id the port holds no role for with the role not-found error', async () => {
    const handler = new GetRoleUseCase(new FakeRbacQuery().withRoles([MANAGER]));

    await expect(handler.execute(new GetRoleQuery(UNKNOWN_ID))).rejects.toThrow(RoleNotFoundError);
  });
});
