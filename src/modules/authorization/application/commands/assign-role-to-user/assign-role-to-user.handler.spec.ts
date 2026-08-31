import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { stubEventBus, stubQueryBus } from '../../../../../../test/support/fakes/bus.stubs';
import { FakeAssignmentRepository } from '../../../../../../test/support/fakes/fake-assignment.repository';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { InMemoryRoleRepository } from '../../../../../../test/support/fakes/in-memory-role.repository';
import { Role } from '../../../domain/entities/role';
import { AssignedUserNotFoundError } from '../../../domain/errors/assigned-user-not-found.error';
import { RoleEscalationForbiddenError } from '../../../domain/errors/role-escalation-forbidden.error';
import { RoleNotAssignableError } from '../../../domain/errors/role-not-assignable.error';
import { RoleNotFoundError } from '../../../domain/errors/role-not-found.error';
import { RoleAssignedToUser } from '../../../domain/events/role-assigned-to-user.event';
import { RoleId } from '../../../domain/value-objects/role-id';
import { RoleName } from '../../../domain/value-objects/role-name';
import { GetUserByIdQuery } from '../../../../users/application/queries/get-user-by-id/get-user-by-id.query';
import { GetUserEffectiveAccessQuery } from '../../queries/get-user-effective-access/get-user-effective-access.query';
import { SystemRole } from '../../contracts/system-roles';
import { AssignRoleToUserCommand } from './assign-role-to-user.command';
import { AssignRoleToUserHandler } from './assign-role-to-user.handler';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ACTOR_ID = '22222222-2222-4222-8222-222222222222';

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

function roleFor(name: SystemRole): Role {
  return Role.create({
    id: RoleId.create(randomUUID()),
    name: RoleName.create(name),
    description: null,
    permissionIds: [],
    now: new Date('2026-08-26T12:00:00.000Z'),
  });
}

function customerRole(): Role {
  return roleFor(SystemRole.Customer);
}

// Makes the stub QueryBus answer GetUserByIdQuery (target exists) and
// GetUserEffectiveAccessQuery (the actor's roles) differently, since the escalation rule needs
// both in the same test.
function respondToQueries(actorRoles: string[]) {
  return (query: unknown) => {
    if (query instanceof GetUserByIdQuery) {
      return Promise.resolve({ id: USER_ID });
    }
    if (query instanceof GetUserEffectiveAccessQuery) {
      return Promise.resolve({ roles: actorRoles, permissions: [] });
    }
    return Promise.resolve(null);
  };
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

  it('should refuse assigning SUPER_ADMIN, even from a super administrator actor', async () => {
    const { handler, roles, assignments, queryBus } = makeHandler();
    await roles.save(roleFor(SystemRole.SuperAdmin));
    queryBus.execute.mockImplementation(respondToQueries([SystemRole.SuperAdmin]));

    await expect(
      handler.execute(
        new AssignRoleToUserCommand(USER_ID, { name: SystemRole.SuperAdmin }, ACTOR_ID),
      ),
    ).rejects.toThrow(RoleNotAssignableError);
    expect(assignments.userRoles.size).toBe(0);
  });

  it('should refuse assigning ADMIN when no actor is supplied', async () => {
    const { handler, roles, assignments, queryBus } = makeHandler();
    await roles.save(roleFor(SystemRole.Admin));
    queryBus.execute.mockImplementation(respondToQueries([]));

    await expect(
      handler.execute(new AssignRoleToUserCommand(USER_ID, { name: SystemRole.Admin })),
    ).rejects.toThrow(RoleEscalationForbiddenError);
    expect(assignments.userRoles.size).toBe(0);
  });

  it('should refuse assigning ADMIN when the actor lacks SUPER_ADMIN', async () => {
    const { handler, roles, assignments, queryBus } = makeHandler();
    await roles.save(roleFor(SystemRole.Admin));
    queryBus.execute.mockImplementation(respondToQueries([SystemRole.Admin]));

    await expect(
      handler.execute(new AssignRoleToUserCommand(USER_ID, { name: SystemRole.Admin }, ACTOR_ID)),
    ).rejects.toThrow(RoleEscalationForbiddenError);
    expect(assignments.userRoles.size).toBe(0);
  });

  it('should assign ADMIN when the actor holds SUPER_ADMIN', async () => {
    const { handler, roles, assignments, queryBus } = makeHandler();
    const role = roleFor(SystemRole.Admin);
    await roles.save(role);
    queryBus.execute.mockImplementation(respondToQueries([SystemRole.SuperAdmin]));

    await handler.execute(
      new AssignRoleToUserCommand(USER_ID, { name: SystemRole.Admin }, ACTOR_ID),
    );

    expect(assignments.userRoles.has(`${USER_ID}:${role.id.value}`)).toBe(true);
  });

  it('should assign SERVICE_ADVISOR and MECHANIC without requiring a super administrator actor', async () => {
    const { handler, roles, assignments, queryBus } = makeHandler();
    const serviceAdvisor = roleFor(SystemRole.ServiceAdvisor);
    const mechanic = roleFor(SystemRole.Mechanic);
    await roles.save(serviceAdvisor);
    await roles.save(mechanic);
    queryBus.execute.mockImplementation(respondToQueries([]));

    await handler.execute(new AssignRoleToUserCommand(USER_ID, { name: SystemRole.ServiceAdvisor }));
    await handler.execute(new AssignRoleToUserCommand(USER_ID, { name: SystemRole.Mechanic }));

    expect(assignments.userRoles.has(`${USER_ID}:${serviceAdvisor.id.value}`)).toBe(true);
    expect(assignments.userRoles.has(`${USER_ID}:${mechanic.id.value}`)).toBe(true);
  });
});
