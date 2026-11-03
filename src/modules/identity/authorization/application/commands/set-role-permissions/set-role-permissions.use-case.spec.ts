import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../../../../../../test/support/fakes/fake-clock';
import { FakePermissionRepository } from '../../../../../../../test/support/fakes/fake-permission.repository';
import { InMemoryRoleRepository } from '../../../../../../../test/support/fakes/in-memory-role.repository';
import { buildRole } from '../../../../../../../test/support/factories/role.factory';
import { PermissionNotFoundError } from '../../../domain/errors/permission-not-found.error';
import { RoleNotFoundError } from '../../../domain/errors/role-not-found.error';
import { PermissionCatalogService } from '../../services/permission-catalog.service';
import { SetRolePermissionsCommand } from './set-role-permissions.command';
import { SetRolePermissionsUseCase } from './set-role-permissions.use-case';

const ROLE_ID = '11111111-1111-4111-8111-111111111111';

async function makeHandler() {
  const permissions = new FakePermissionRepository(['users:read', 'roles:read', 'roles:manage']);
  const [usersRead, rolesRead, rolesManage] = (await permissions.findAll()).map(
    (permission) => permission.id.value,
  );
  const roles = new InMemoryRoleRepository();
  await roles.save(buildRole({ id: ROLE_ID, permissionIds: [usersRead] }));
  const clock = new FakeClock(new Date('2026-09-01T09:00:00.000Z'));
  const handler = new SetRolePermissionsUseCase(
    roles,
    new PermissionCatalogService(permissions),
    clock,
  );
  return { handler, roles, clock, ids: { usersRead, rolesRead, rolesManage } };
}

function stored(roles: InMemoryRoleRepository) {
  const role = roles.roles.find((candidate) => candidate.id.value === ROLE_ID)!;
  return { permissionIds: [...role.permissionIds], updatedAt: role.updatedAt };
}

describe('SetRolePermissionsUseCase', () => {
  it('replaces the permissions of the role with the ones the codes name, stamping the update with the clock', async () => {
    const { handler, roles, clock, ids } = await makeHandler();

    await handler.execute(new SetRolePermissionsCommand(ROLE_ID, ['roles:read', 'roles:manage']));

    expect(stored(roles)).toEqual({
      permissionIds: [ids.rolesRead, ids.rolesManage],
      updatedAt: clock.now(),
    });
  });

  it('refuses a code the catalog does not hold and leaves the permissions of the role as they were', async () => {
    const { handler, roles, ids } = await makeHandler();

    await expect(
      handler.execute(new SetRolePermissionsCommand(ROLE_ID, ['roles:read', 'ghost:read'])),
    ).rejects.toThrow(PermissionNotFoundError);
    expect(stored(roles).permissionIds).toEqual([ids.usersRead]);
  });

  it('refuses a role that does not exist with the role not-found error', async () => {
    const { handler } = await makeHandler();

    await expect(
      handler.execute(
        new SetRolePermissionsCommand('33333333-3333-4333-8333-333333333333', ['roles:read']),
      ),
    ).rejects.toThrow(RoleNotFoundError);
  });
});
