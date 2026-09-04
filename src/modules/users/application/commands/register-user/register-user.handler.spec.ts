import { describe, expect, it } from 'vitest';
import { stubCommandBus, stubEventBus } from '../../../../../../test/support/fakes/bus.stubs';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { FakeIdGenerator } from '../../../../../../test/support/fakes/fake-id-generator';
import { FakePasswordHasher } from '../../../../../../test/support/fakes/fake-password-hasher';
import { FakeTransactionRunner } from '../../../../../../test/support/fakes/fake-transaction-runner';
import { InMemoryUserRepository } from '../../../../../../test/support/fakes/in-memory-user.repository';
import { buildUser } from '../../../../../../test/support/factories/user.factory';
import { AssignRoleToUserCommand } from '../../../../authorization/application/commands/assign-role-to-user/assign-role-to-user.command';
import { SystemRole } from '../../../../authorization/application/contracts/system-roles';
import { DocumentAlreadyInUseError } from '../../../domain/errors/document-already-in-use.error';
import { EmailAlreadyInUseError } from '../../../domain/errors/email-already-in-use.error';
import { InvalidPersonDocumentError } from '../../../domain/errors/invalid-person-document.error';
import { WeakPasswordError } from '../../../domain/errors/weak-password.error';
import { RegisterUserCommand } from './register-user.command';
import { RegisterUserHandler } from './register-user.handler';

function makeHandler() {
  const users = new InMemoryUserRepository();
  const commandBus = stubCommandBus();
  const eventBus = stubEventBus();
  const transactionRunner = new FakeTransactionRunner();
  const handler = new RegisterUserHandler(
    users,
    new FakePasswordHasher(),
    new FakeIdGenerator(),
    new FakeClock(),
    transactionRunner,
    commandBus.bus,
    eventBus.bus,
  );
  return { handler, users, commandBus, eventBus, transactionRunner };
}

describe('RegisterUserHandler', () => {
  it('should create a user with a hashed password and a document and assign the default customer role', async () => {
    const { handler, users, commandBus } = makeHandler();

    const result = await handler.execute(
      new RegisterUserCommand('jane@example.com', 'Jane Doe', 'Str0ngPassword', '11144477735'),
    );

    const saved = users.users[0];
    expect(result.id).toBe(saved.id.value);
    expect(saved.email.value).toBe('jane@example.com');
    expect(saved.passwordHash.value).toBe('hashed:Str0ngPassword');
    expect(saved.document.value).toBe('11144477735');
    expect(commandBus.execute).toHaveBeenCalledWith(
      new AssignRoleToUserCommand(saved.id.value, { name: SystemRole.Customer }),
    );
  });

  it('should generate a temporary password for a staff-created account and flag it pending', async () => {
    const { handler, users, commandBus } = makeHandler();

    const result = await handler.execute(
      new RegisterUserCommand('jane@example.com', 'Jane Doe', undefined, '11144477735', true),
    );

    const saved = users.users[0];
    expect(result.temporaryPassword).toBeDefined();
    expect(result.temporaryPassword).toHaveLength(12);
    expect(saved.mustChangePassword).toBe(true);
    expect(saved.passwordHash.value).toBe(`hashed:${result.temporaryPassword}`);
    expect(commandBus.execute).toHaveBeenCalledWith(
      new AssignRoleToUserCommand(saved.id.value, { name: SystemRole.Customer }),
    );
  });

  it('should not return a temporary password for a self-registered account', async () => {
    const { handler, users } = makeHandler();

    const result = await handler.execute(
      new RegisterUserCommand('jane@example.com', 'Jane Doe', 'Str0ngPassword', '11144477735'),
    );

    expect(result.temporaryPassword).toBeUndefined();
    expect(users.users[0].mustChangePassword).toBe(false);
  });

  it('should not create a user with an existing email', async () => {
    const { handler, users, commandBus } = makeHandler();
    await users.save(buildUser({ email: 'jane@example.com', document: '11144477735' }));

    await expect(
      handler.execute(
        new RegisterUserCommand('jane@example.com', 'Jane Doe', 'Str0ngPassword', '52998224725'),
      ),
    ).rejects.toThrow(EmailAlreadyInUseError);
    expect(users.users).toHaveLength(1);
    expect(commandBus.execute).not.toHaveBeenCalled();
  });

  it('should not create a user with a weak password', async () => {
    const { handler, users } = makeHandler();

    await expect(
      handler.execute(
        new RegisterUserCommand('jane@example.com', 'Jane Doe', 'short', '11144477735'),
      ),
    ).rejects.toThrow(WeakPasswordError);
    expect(users.users).toHaveLength(0);
  });

  it('should not create a user with an invalid document', async () => {
    const { handler, users, commandBus } = makeHandler();

    await expect(
      handler.execute(
        new RegisterUserCommand('jane@example.com', 'Jane Doe', 'Str0ngPassword', '11111111111'),
      ),
    ).rejects.toThrow(InvalidPersonDocumentError);
    expect(users.users).toHaveLength(0);
    expect(commandBus.execute).not.toHaveBeenCalled();
  });

  it('should not create a user with a document already in use', async () => {
    const { handler, users, commandBus } = makeHandler();
    await users.save(buildUser({ email: 'existing@example.com', document: '11144477735' }));

    await expect(
      handler.execute(
        new RegisterUserCommand('jane@example.com', 'Jane Doe', 'Str0ngPassword', '11144477735'),
      ),
    ).rejects.toThrow(DocumentAlreadyInUseError);
    expect(users.users).toHaveLength(1);
    expect(commandBus.execute).not.toHaveBeenCalled();
  });

  it('should propagate the role assignment failure through the transaction boundary', async () => {
    const { handler, commandBus, transactionRunner } = makeHandler();
    const assignmentFailure = new Error('role assignment failed');
    commandBus.execute.mockRejectedValueOnce(assignmentFailure);

    await expect(
      handler.execute(
        new RegisterUserCommand('jane@example.com', 'Jane Doe', 'Str0ngPassword', '11144477735'),
      ),
    ).rejects.toThrow(assignmentFailure);
    expect(transactionRunner.runCalls).toBe(1);
  });
});
