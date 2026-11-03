import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../../../../../../test/support/fakes/fake-clock';
import { InMemoryRoleRepository } from '../../../../../../../test/support/fakes/in-memory-role.repository';
import { buildRole } from '../../../../../../../test/support/factories/role.factory';
import { RoleNameAlreadyInUseError } from '../../../domain/errors/role-name-already-in-use.error';
import { RoleNotFoundError } from '../../../domain/errors/role-not-found.error';
import { UpdateRoleCommand } from './update-role.command';
import { UpdateRoleUseCase } from './update-role.use-case';

const ROLE_ID = '11111111-1111-4111-8111-111111111111';

async function makeHandler() {
  const roles = new InMemoryRoleRepository();
  await roles.save(
    buildRole({ id: ROLE_ID, name: 'WORKSHOP_MANAGER', description: 'Manages the workshop' }),
  );
  await roles.save(buildRole({ name: 'NIGHT_SHIFT' }));
  const clock = new FakeClock(new Date('2026-09-01T09:00:00.000Z'));
  return { handler: new UpdateRoleUseCase(roles, clock), roles, clock };
}

function stored(roles: InMemoryRoleRepository) {
  const role = roles.roles.find((candidate) => candidate.id.value === ROLE_ID)!;
  return { name: role.name.value, description: role.description, updatedAt: role.updatedAt };
}

describe('UpdateRoleUseCase', () => {
  it('renames the role and replaces its description, stamping the update with the clock', async () => {
    const { handler, roles, clock } = await makeHandler();

    await handler.execute(new UpdateRoleCommand(ROLE_ID, 'floor_manager', 'Runs the floor'));

    expect(stored(roles)).toEqual({
      name: 'FLOOR_MANAGER',
      description: 'Runs the floor',
      updatedAt: clock.now(),
    });
  });

  it('keeps the name when the command carries none', async () => {
    const { handler, roles } = await makeHandler();

    await handler.execute(new UpdateRoleCommand(ROLE_ID, undefined, 'Runs the floor'));

    expect(stored(roles)).toMatchObject({
      name: 'WORKSHOP_MANAGER',
      description: 'Runs the floor',
    });
  });

  it('accepts the name the role already holds', async () => {
    const { handler, roles } = await makeHandler();

    await handler.execute(new UpdateRoleCommand(ROLE_ID, 'workshop_manager', undefined));

    expect(stored(roles)).toMatchObject({
      name: 'WORKSHOP_MANAGER',
      description: 'Manages the workshop',
    });
  });

  it('refuses a name another role holds with the name-in-use error and changes nothing', async () => {
    const { handler, roles } = await makeHandler();

    await expect(
      handler.execute(new UpdateRoleCommand(ROLE_ID, 'NIGHT_SHIFT', 'Runs the floor')),
    ).rejects.toThrow(RoleNameAlreadyInUseError);
    expect(stored(roles)).toMatchObject({
      name: 'WORKSHOP_MANAGER',
      description: 'Manages the workshop',
    });
  });

  it('refuses a role that does not exist with the role not-found error', async () => {
    const { handler } = await makeHandler();

    await expect(
      handler.execute(
        new UpdateRoleCommand('33333333-3333-4333-8333-333333333333', undefined, 'x'),
      ),
    ).rejects.toThrow(RoleNotFoundError);
  });
});
