import { describe, expect, it } from 'vitest';
import { InMemoryRoleRepository } from '../../../../../../../test/support/fakes/in-memory-role.repository';
import { buildRole } from '../../../../../../../test/support/factories/role.factory';
import { RoleNotFoundError } from '../../../domain/errors/role-not-found.error';
import { SystemRoleImmutableError } from '../../../domain/errors/system-role-immutable.error';
import { DeleteRoleCommand } from './delete-role.command';
import { DeleteRoleUseCase } from './delete-role.use-case';

const ROLE_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ROLE_ID = '22222222-2222-4222-8222-222222222222';

async function makeHandler() {
  const roles = new InMemoryRoleRepository();
  await roles.save(buildRole({ id: ROLE_ID, name: 'WORKSHOP_MANAGER' }));
  await roles.save(buildRole({ id: OTHER_ROLE_ID, name: 'NIGHT_SHIFT' }));
  await roles.save(buildRole({ name: 'ADMIN', isSystem: true }));
  return { handler: new DeleteRoleUseCase(roles), roles };
}

describe('DeleteRoleUseCase', () => {
  it('deletes the role asked for and keeps the others', async () => {
    const { handler, roles } = await makeHandler();

    await handler.execute(new DeleteRoleCommand(ROLE_ID));

    expect(roles.roles.map((role) => role.name.value).sort()).toEqual(['ADMIN', 'NIGHT_SHIFT']);
  });

  it('refuses a role that does not exist with the role not-found error and deletes nothing', async () => {
    const { handler, roles } = await makeHandler();

    await expect(
      handler.execute(new DeleteRoleCommand('33333333-3333-4333-8333-333333333333')),
    ).rejects.toThrow(RoleNotFoundError);
    expect(roles.roles).toHaveLength(3);
  });

  it('refuses a system role with the system role immutable error and keeps it', async () => {
    const { handler, roles } = await makeHandler();
    const system = roles.roles.find((role) => role.isSystem);

    await expect(handler.execute(new DeleteRoleCommand(system!.id.value))).rejects.toThrow(
      SystemRoleImmutableError,
    );
    expect(roles.roles).toHaveLength(3);
  });
});
