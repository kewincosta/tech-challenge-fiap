import { describe, expect, it } from 'vitest';
import { FailingUserRepository } from '../../../../../../../test/support/fakes/failing-user.repository';
import { FakeAccessCache } from '../../../../../../../test/support/fakes/fake-access-cache';
import { FakeAssignmentRepository } from '../../../../../../../test/support/fakes/fake-assignment.repository';
import { FakeClock } from '../../../../../../../test/support/fakes/fake-clock';
import { FakeEffectiveAccessReader } from '../../../../../../../test/support/fakes/fake-effective-access-reader';
import { InMemoryRoleRepository } from '../../../../../../../test/support/fakes/in-memory-role.repository';
import { InMemoryUserRepository } from '../../../../../../../test/support/fakes/in-memory-user.repository';
import { RecordingDomainEventPublisher } from '../../../../../../../test/support/fakes/recording-domain-event-publisher';
import { buildRole } from '../../../../../../../test/support/factories/role.factory';
import { buildUser } from '../../../../../../../test/support/factories/user.factory';
import { Role } from '../../../domain/entities/role';
import { AssignedUserNotFoundError } from '../../../domain/errors/assigned-user-not-found.error';
import { RoleEscalationForbiddenError } from '../../../domain/errors/role-escalation-forbidden.error';
import { RoleNotAssignableError } from '../../../domain/errors/role-not-assignable.error';
import { RoleNotFoundError } from '../../../domain/errors/role-not-found.error';
import { RoleAssignedToUser } from '../../../domain/events/role-assigned-to-user.event';
import { GetUserByIdHandler } from '../../../../users/application/queries/get-user-by-id/get-user-by-id.handler';
import { SystemRole } from '../../contracts/system-roles';
import { GetUserEffectiveAccessHandler } from '../../queries/get-user-effective-access/get-user-effective-access.handler';
import { EffectiveAccessService } from '../../services/effective-access.service';
import { AssignRoleToUserCommand } from './assign-role-to-user.command';
import { AssignRoleToUserHandler } from './assign-role-to-user.handler';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ACTOR_ID = '22222222-2222-4222-8222-222222222222';

// The target user exists unless a case says otherwise. The actor holds the roles a case grants it.
async function makeHandler(options: { targetExists?: boolean; lookupFailure?: Error } = {}) {
  const roles = new InMemoryRoleRepository();
  const assignments = new FakeAssignmentRepository();
  const users = options.lookupFailure
    ? new FailingUserRepository(options.lookupFailure)
    : new InMemoryUserRepository();
  if (options.targetExists ?? true) {
    await users.save(buildUser({ id: USER_ID }));
  }
  const access = new FakeEffectiveAccessReader();
  const events = new RecordingDomainEventPublisher();
  const clock = new FakeClock();
  const handler = new AssignRoleToUserHandler(
    roles,
    assignments,
    clock,
    new GetUserEffectiveAccessHandler(new EffectiveAccessService(new FakeAccessCache(), access)),
    new GetUserByIdHandler(users),
    events,
  );
  return { handler, roles, assignments, access, events, clock };
}

function roleFor(name: SystemRole): Role {
  return buildRole({ name });
}

function customerRole(): Role {
  return roleFor(SystemRole.Customer);
}

describe('AssignRoleToUserHandler', () => {
  it('should assign a role referenced by name', async () => {
    const { handler, roles, assignments, events, clock } = await makeHandler();
    const role = customerRole();
    await roles.save(role);

    await handler.execute(new AssignRoleToUserCommand(USER_ID, { name: SystemRole.Customer }));

    expect(assignments.userRoles.has(`${USER_ID}:${role.id.value}`)).toBe(true);
    expect(events.published).toEqual([
      new RoleAssignedToUser(USER_ID, role.id.value, SystemRole.Customer, clock.now()),
    ]);
  });

  it('should assign a role referenced by id', async () => {
    const { handler, roles, assignments } = await makeHandler();
    const role = customerRole();
    await roles.save(role);

    await handler.execute(new AssignRoleToUserCommand(USER_ID, { id: role.id.value }));

    expect(assignments.userRoles.has(`${USER_ID}:${role.id.value}`)).toBe(true);
  });

  it('should be idempotent when the role is assigned twice', async () => {
    const { handler, roles, assignments } = await makeHandler();
    const role = customerRole();
    await roles.save(role);

    await handler.execute(new AssignRoleToUserCommand(USER_ID, { id: role.id.value }));
    await handler.execute(new AssignRoleToUserCommand(USER_ID, { id: role.id.value }));

    expect(assignments.userRoles.size).toBe(1);
  });

  it('should not assign a role to an unknown user', async () => {
    const { handler, roles } = await makeHandler({ targetExists: false });
    await roles.save(customerRole());

    await expect(
      handler.execute(new AssignRoleToUserCommand(USER_ID, { name: SystemRole.Customer })),
    ).rejects.toThrow(AssignedUserNotFoundError);
  });

  it('should not report a failure of the user lookup as an unknown user', async () => {
    const failure = new Error('database is down');
    const { handler, roles, assignments } = await makeHandler({ lookupFailure: failure });
    await roles.save(customerRole());

    await expect(
      handler.execute(new AssignRoleToUserCommand(USER_ID, { name: SystemRole.Customer })),
    ).rejects.toBe(failure);
    expect(assignments.userRoles.size).toBe(0);
  });

  it('should not assign an unknown role', async () => {
    const { handler } = await makeHandler();

    await expect(
      handler.execute(new AssignRoleToUserCommand(USER_ID, { name: 'GHOST' })),
    ).rejects.toThrow(RoleNotFoundError);
  });

  it('should refuse assigning SUPER_ADMIN, even from a super administrator actor', async () => {
    const { handler, roles, assignments, access } = await makeHandler();
    await roles.save(roleFor(SystemRole.SuperAdmin));
    access.withAccess(ACTOR_ID, { roles: [SystemRole.SuperAdmin] });

    await expect(
      handler.execute(
        new AssignRoleToUserCommand(USER_ID, { name: SystemRole.SuperAdmin }, ACTOR_ID),
      ),
    ).rejects.toThrow(RoleNotAssignableError);
    expect(assignments.userRoles.size).toBe(0);
  });

  it('should refuse assigning ADMIN when no actor is supplied', async () => {
    const { handler, roles, assignments } = await makeHandler();
    await roles.save(roleFor(SystemRole.Admin));

    await expect(
      handler.execute(new AssignRoleToUserCommand(USER_ID, { name: SystemRole.Admin })),
    ).rejects.toThrow(RoleEscalationForbiddenError);
    expect(assignments.userRoles.size).toBe(0);
  });

  it('should refuse assigning ADMIN when the actor lacks SUPER_ADMIN', async () => {
    const { handler, roles, assignments, access } = await makeHandler();
    await roles.save(roleFor(SystemRole.Admin));
    access.withAccess(ACTOR_ID, { roles: [SystemRole.Admin] });

    await expect(
      handler.execute(new AssignRoleToUserCommand(USER_ID, { name: SystemRole.Admin }, ACTOR_ID)),
    ).rejects.toThrow(RoleEscalationForbiddenError);
    expect(assignments.userRoles.size).toBe(0);
  });

  it('should assign ADMIN when the actor holds SUPER_ADMIN', async () => {
    const { handler, roles, assignments, access } = await makeHandler();
    const role = roleFor(SystemRole.Admin);
    await roles.save(role);
    access.withAccess(ACTOR_ID, { roles: [SystemRole.SuperAdmin] });

    await handler.execute(
      new AssignRoleToUserCommand(USER_ID, { name: SystemRole.Admin }, ACTOR_ID),
    );

    expect(assignments.userRoles.has(`${USER_ID}:${role.id.value}`)).toBe(true);
  });

  it('should assign SERVICE_ADVISOR and MECHANIC without requiring a super administrator actor', async () => {
    const { handler, roles, assignments } = await makeHandler();
    const serviceAdvisor = roleFor(SystemRole.ServiceAdvisor);
    const mechanic = roleFor(SystemRole.Mechanic);
    await roles.save(serviceAdvisor);
    await roles.save(mechanic);

    await handler.execute(
      new AssignRoleToUserCommand(USER_ID, { name: SystemRole.ServiceAdvisor }),
    );
    await handler.execute(new AssignRoleToUserCommand(USER_ID, { name: SystemRole.Mechanic }));

    expect(assignments.userRoles.has(`${USER_ID}:${serviceAdvisor.id.value}`)).toBe(true);
    expect(assignments.userRoles.has(`${USER_ID}:${mechanic.id.value}`)).toBe(true);
  });
});
