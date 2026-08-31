import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { FakeIdGenerator } from '../../../../../../test/support/fakes/fake-id-generator';
import { FakePermissionRepository } from '../../../../../../test/support/fakes/fake-permission.repository';
import { InMemoryRoleRepository } from '../../../../../../test/support/fakes/in-memory-role.repository';
import { PermissionNotFoundError } from '../../../domain/errors/permission-not-found.error';
import { RoleNameAlreadyInUseError } from '../../../domain/errors/role-name-already-in-use.error';
import { PermissionCatalogService } from '../../services/permission-catalog.service';
import { CreateRoleCommand } from './create-role.command';
import { CreateRoleHandler } from './create-role.handler';

function makeHandler() {
  const roles = new InMemoryRoleRepository();
  const permissions = new FakePermissionRepository(['users:read', 'roles:read']);
  const handler = new CreateRoleHandler(
    roles,
    new PermissionCatalogService(permissions),
    new FakeIdGenerator(),
    new FakeClock(),
  );
  return { handler, roles };
}

describe('CreateRoleHandler', () => {
  it('should create a role with the given permissions', async () => {
    const { handler, roles } = makeHandler();

    const result = await handler.execute(
      new CreateRoleCommand('workshop_manager', 'Manages the workshop', ['users:read']),
    );

    const created = roles.roles[0];
    expect(result.id).toBe(created.id.value);
    expect(created.name.value).toBe('WORKSHOP_MANAGER');
    expect(created.permissionIds).toHaveLength(1);
  });

  it('should not create a role with an existing name', async () => {
    const { handler } = makeHandler();
    await handler.execute(new CreateRoleCommand('WORKSHOP_MANAGER', null, []));

    await expect(
      handler.execute(new CreateRoleCommand('WORKSHOP_MANAGER', null, [])),
    ).rejects.toThrow(RoleNameAlreadyInUseError);
  });

  it('should not create a role with an unknown permission', async () => {
    const { handler, roles } = makeHandler();

    await expect(
      handler.execute(new CreateRoleCommand('WORKSHOP_MANAGER', null, ['ghost:read'])),
    ).rejects.toThrow(PermissionNotFoundError);
    expect(roles.roles).toHaveLength(0);
  });
});
