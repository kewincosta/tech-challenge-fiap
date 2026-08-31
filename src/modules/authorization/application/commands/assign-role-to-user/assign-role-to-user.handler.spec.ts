import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { stubEventBus, stubQueryBus } from '../../../../../../test/support/fakes/bus.stubs';
import { FakeAssignmentRepository } from '../../../../../../test/support/fakes/fake-assignment.repository';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { InMemoryRoleRepository } from '../../../../../../test/support/fakes/in-memory-role.repository';
import { Role } from '../../../domain/entities/role';
import { AssignedUserNotFoundError } from '../../../domain/errors/assigned-user-not-found.error';
import { RoleNotFoundError } from '../../../domain/errors/role-not-found.error';
import { RoleAssignedToUser } from '../../../domain/events/role-assigned-to-user.event';
import { RoleId } from '../../../domain/value-objects/role-id';
import { RoleName } from '../../../domain/value-objects/role-name';
import { SystemRole } from '../../contracts/system-roles';
import { AssignRoleToUserCommand } from './assign-role-to-user.command';
import { AssignRoleToUserHandler } from './assign-role-to-user.handler';

const USER_ID = '11111111-1111-4111-8111-111111111111';

function makeHandler() {
  const roles = new InMemoryRoleRepository();
  const assignments = new FakeAssignmentRepository();
  const queryBus = stubQueryBus();
  const eventBus = stubEventBus();
  const handler = new AssignRoleToUserHandler(
    roles,
    assignments,
    new FakeClock(),
    queryBus.bus,
    eventBus.bus,
  );
  return { handler, roles, assignments, queryBus, eventBus };
}

function customerRole(): Role {
  return Role.create({
    id: RoleId.create(randomUUID()),
    name: RoleName.create(SystemRole.Customer),
    description: null,
    permissionIds: [],
    now: new Date('2026-08-26T12:00:00.000Z'),
  });
}

describe('AssignRoleToUserHandler', () => {
  it('should assign a role referenced by name', async () => {
    const { handler, roles, assignments, queryBus, eventBus } = makeHandler();
    const role = customerRole();
    await roles.save(role);
    queryBus.execute.mockResolvedValue({ id: USER_ID });

    await handler.execute(new AssignRoleToUserCommand(USER_ID, { name: SystemRole.Customer }));

    expect(assignments.userRoles.has(`${USER_ID}:${role.id.value}`)).toBe(true);
    expect(eventBus.publish).toHaveBeenCalledWith(expect.any(RoleAssignedToUser));
  });

  it('should assign a role referenced by id', async () => {
    const { handler, roles, assignments, queryBus } = makeHandler();
    const role = customerRole();
    await roles.save(role);
    queryBus.execute.mockResolvedValue({ id: USER_ID });

    await handler.execute(new AssignRoleToUserCommand(USER_ID, { id: role.id.value }));

    expect(assignments.userRoles.has(`${USER_ID}:${role.id.value}`)).toBe(true);
  });

  it('should be idempotent when the role is assigned twice', async () => {
    const { handler, roles, assignments, queryBus } = makeHandler();
    const role = customerRole();
    await roles.save(role);
    queryBus.execute.mockResolvedValue({ id: USER_ID });

    await handler.execute(new AssignRoleToUserCommand(USER_ID, { id: role.id.value }));
    await handler.execute(new AssignRoleToUserCommand(USER_ID, { id: role.id.value }));

    expect(assignments.userRoles.size).toBe(1);
  });

  it('should not assign a role to an unknown user', async () => {
    const { handler, roles, queryBus } = makeHandler();
    await roles.save(customerRole());
    queryBus.execute.mockResolvedValue(null);

    await expect(
      handler.execute(new AssignRoleToUserCommand(USER_ID, { name: SystemRole.Customer })),
    ).rejects.toThrow(AssignedUserNotFoundError);
  });

  it('should not assign an unknown role', async () => {
    const { handler, queryBus } = makeHandler();
    queryBus.execute.mockResolvedValue({ id: USER_ID });

    await expect(
      handler.execute(new AssignRoleToUserCommand(USER_ID, { name: 'GHOST' })),
    ).rejects.toThrow(RoleNotFoundError);
  });
});
