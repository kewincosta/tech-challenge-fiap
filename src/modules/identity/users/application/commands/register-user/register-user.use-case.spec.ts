import { describe, expect, it } from 'vitest';
import { FakeAccessCache } from '../../../../../../../test/support/fakes/fake-access-cache';
import { FakeAssignmentRepository } from '../../../../../../../test/support/fakes/fake-assignment.repository';
import { FakeClock } from '../../../../../../../test/support/fakes/fake-clock';
import { FakeEffectiveAccessReader } from '../../../../../../../test/support/fakes/fake-effective-access-reader';
import { FakeIdGenerator } from '../../../../../../../test/support/fakes/fake-id-generator';
import { FakePasswordHasher } from '../../../../../../../test/support/fakes/fake-password-hasher';
import { FakeTransactionRunner } from '../../../../../../../test/support/fakes/fake-transaction-runner';
import { InMemoryRoleRepository } from '../../../../../../../test/support/fakes/in-memory-role.repository';
import { InMemoryUserRepository } from '../../../../../../../test/support/fakes/in-memory-user.repository';
import { RecordingDomainEventPublisher } from '../../../../../../../test/support/fakes/recording-domain-event-publisher';
import { buildRole } from '../../../../../../../test/support/factories/role.factory';
import { buildUser } from '../../../../../../../test/support/factories/user.factory';
import { AssignRoleToUserUseCase } from '../../../../authorization/application/commands/assign-role-to-user/assign-role-to-user.use-case';
import { SystemRole } from '../../../../authorization/application/contracts/system-roles';
import { GetUserEffectiveAccessUseCase } from '../../../../authorization/application/queries/get-user-effective-access/get-user-effective-access.use-case';
import { EffectiveAccessService } from '../../../../authorization/application/services/effective-access.service';
import { DocumentAlreadyInUseError } from '../../../domain/errors/document-already-in-use.error';
import { EmailAlreadyInUseError } from '../../../domain/errors/email-already-in-use.error';
import { InvalidPersonDocumentError } from '../../../domain/errors/invalid-person-document.error';
import { WeakPasswordError } from '../../../domain/errors/weak-password.error';
import { UserRegistered } from '../../../domain/events/user-registered.event';
import { GetUserByIdUseCase } from '../../queries/get-user-by-id/get-user-by-id.use-case';
import { RegisterUserCommand } from './register-user.command';
import { RegisterUserUseCase } from './register-user.use-case';

// The role assignment is the real use case over fakes: the CUSTOMER role exists, and
// `assignments` shows which roles the users ended up with. `events` holds what registration
// published.
async function makeHandler(assignments = new FakeAssignmentRepository()) {
  const users = new InMemoryUserRepository();
  const roles = new InMemoryRoleRepository();
  const customerRole = buildRole({ name: SystemRole.Customer, isSystem: true });
  await roles.save(customerRole);
  const clock = new FakeClock();
  const assignRoleToUser = new AssignRoleToUserUseCase(
    roles,
    assignments,
    clock,
    new GetUserEffectiveAccessUseCase(
      new EffectiveAccessService(new FakeAccessCache(), new FakeEffectiveAccessReader()),
    ),
    new GetUserByIdUseCase(users),
    new RecordingDomainEventPublisher(),
  );
  const events = new RecordingDomainEventPublisher();
  const transactionRunner = new FakeTransactionRunner();
  const handler = new RegisterUserUseCase(
    users,
    new FakePasswordHasher(),
    new FakeIdGenerator(),
    clock,
    transactionRunner,
    assignRoleToUser,
    events,
  );
  return { handler, users, assignments, customerRole, events, clock, transactionRunner };
}

describe('RegisterUserUseCase', () => {
  it('should create a user with a hashed password and a document and assign the default customer role', async () => {
    const { handler, users, assignments, customerRole, events, clock } = await makeHandler();

    const result = await handler.execute(
      new RegisterUserCommand('jane@example.com', 'Jane Doe', 'Str0ngPassword', '11144477735'),
    );

    const saved = users.users[0];
    expect(result.id).toBe(saved.id.value);
    expect(saved.email.value).toBe('jane@example.com');
    expect(saved.passwordHash.value).toBe('hashed:Str0ngPassword');
    expect(saved.document.value).toBe('11144477735');
    expect([...assignments.userRoles]).toEqual([`${saved.id.value}:${customerRole.id.value}`]);
    expect(events.published).toEqual([
      new UserRegistered(saved.id.value, 'jane@example.com', clock.now()),
    ]);
  });

  it('should generate a temporary password for a staff-created account and flag it pending', async () => {
    const { handler, users, assignments, customerRole } = await makeHandler();

    const result = await handler.execute(
      new RegisterUserCommand('jane@example.com', 'Jane Doe', undefined, '11144477735', true),
    );

    const saved = users.users[0];
    expect(result.temporaryPassword).toBeDefined();
    expect(result.temporaryPassword).toHaveLength(12);
    expect(saved.mustChangePassword).toBe(true);
    expect(saved.passwordHash.value).toBe(`hashed:${result.temporaryPassword}`);
    expect([...assignments.userRoles]).toEqual([`${saved.id.value}:${customerRole.id.value}`]);
  });

  it('should not return a temporary password for a self-registered account', async () => {
    const { handler, users } = await makeHandler();

    const result = await handler.execute(
      new RegisterUserCommand('jane@example.com', 'Jane Doe', 'Str0ngPassword', '11144477735'),
    );

    expect(result.temporaryPassword).toBeUndefined();
    expect(users.users[0].mustChangePassword).toBe(false);
  });

  it('should not create a user with an existing email', async () => {
    const { handler, users, assignments } = await makeHandler();
    await users.save(buildUser({ email: 'jane@example.com', document: '11144477735' }));

    await expect(
      handler.execute(
        new RegisterUserCommand('jane@example.com', 'Jane Doe', 'Str0ngPassword', '52998224725'),
      ),
    ).rejects.toThrow(EmailAlreadyInUseError);
    expect(users.users).toHaveLength(1);
    expect(assignments.userRoles.size).toBe(0);
  });

  it('should not create a user with a weak password', async () => {
    const { handler, users } = await makeHandler();

    await expect(
      handler.execute(
        new RegisterUserCommand('jane@example.com', 'Jane Doe', 'short', '11144477735'),
      ),
    ).rejects.toThrow(WeakPasswordError);
    expect(users.users).toHaveLength(0);
  });

  it('should not create a user with an invalid document', async () => {
    const { handler, users, assignments } = await makeHandler();

    await expect(
      handler.execute(
        new RegisterUserCommand('jane@example.com', 'Jane Doe', 'Str0ngPassword', '11111111111'),
      ),
    ).rejects.toThrow(InvalidPersonDocumentError);
    expect(users.users).toHaveLength(0);
    expect(assignments.userRoles.size).toBe(0);
  });

  it('should not create a user with a document already in use', async () => {
    const { handler, users, assignments } = await makeHandler();
    await users.save(buildUser({ email: 'existing@example.com', document: '11144477735' }));

    await expect(
      handler.execute(
        new RegisterUserCommand('jane@example.com', 'Jane Doe', 'Str0ngPassword', '11144477735'),
      ),
    ).rejects.toThrow(DocumentAlreadyInUseError);
    expect(users.users).toHaveLength(1);
    expect(assignments.userRoles.size).toBe(0);
  });

  it('should propagate the role assignment failure through the transaction boundary', async () => {
    const assignmentFailure = new Error('role assignment failed');
    class FailingAssignments extends FakeAssignmentRepository {
      override assignRoleToUser(): Promise<void> {
        return Promise.reject(assignmentFailure);
      }
    }
    const { handler, transactionRunner, events } = await makeHandler(new FailingAssignments());

    await expect(
      handler.execute(
        new RegisterUserCommand('jane@example.com', 'Jane Doe', 'Str0ngPassword', '11144477735'),
      ),
    ).rejects.toThrow(assignmentFailure);
    expect(transactionRunner.runCalls).toBe(1);
    expect(events.published).toEqual([]);
  });
});
