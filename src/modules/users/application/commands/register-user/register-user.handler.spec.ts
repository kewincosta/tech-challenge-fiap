import { describe, expect, it } from 'vitest';
import {
  stubCommandBus,
  stubEventBus,
} from '../../../../../../test/support/fakes/bus.stubs';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { FakeIdGenerator } from '../../../../../../test/support/fakes/fake-id-generator';
import { FakePasswordHasher } from '../../../../../../test/support/fakes/fake-password-hasher';
import { InMemoryUserRepository } from '../../../../../../test/support/fakes/in-memory-user.repository';
import { buildUser } from '../../../../../../test/support/factories/user.factory';
import { AssignRoleToUserCommand } from '../../../../authorization/application/commands/assign-role-to-user/assign-role-to-user.command';
import { SystemRole } from '../../../../authorization/application/contracts/system-roles';
import { EmailAlreadyInUseError } from '../../../domain/errors/email-already-in-use.error';
import { WeakPasswordError } from '../../../domain/errors/weak-password.error';
import { RegisterUserCommand } from './register-user.command';
import { RegisterUserHandler } from './register-user.handler';

function makeHandler() {
  const users = new InMemoryUserRepository();
  const commandBus = stubCommandBus();
  const eventBus = stubEventBus();
  const handler = new RegisterUserHandler(
    users,
    new FakePasswordHasher(),
    new FakeIdGenerator(),
    new FakeClock(),
    commandBus.bus,
    eventBus.bus,
  );
  return { handler, users, commandBus, eventBus };
}

describe('RegisterUserHandler', () => {
  it('should create a user with a hashed password and assign the default customer role', async () => {
    const { handler, users, commandBus } = makeHandler();

    const result = await handler.execute(
      new RegisterUserCommand('jane@example.com', 'Jane Doe', 'Str0ngPassword'),
    );

    const saved = users.users[0];
    expect(result.id).toBe(saved.id.value);
    expect(saved.email.value).toBe('jane@example.com');
    expect(saved.passwordHash.value).toBe('hashed:Str0ngPassword');
    expect(commandBus.execute).toHaveBeenCalledWith(
      new AssignRoleToUserCommand(saved.id.value, { name: SystemRole.Customer }),
    );
  });

  it('should not create a user with an existing email', async () => {
    const { handler, users, commandBus } = makeHandler();
    await users.save(buildUser({ email: 'jane@example.com' }));

    await expect(
      handler.execute(new RegisterUserCommand('jane@example.com', 'Jane Doe', 'Str0ngPassword')),
    ).rejects.toThrow(EmailAlreadyInUseError);
    expect(users.users).toHaveLength(1);
    expect(commandBus.execute).not.toHaveBeenCalled();
  });

  it('should not create a user with a weak password', async () => {
    const { handler, users } = makeHandler();

    await expect(
      handler.execute(new RegisterUserCommand('jane@example.com', 'Jane Doe', 'short')),
    ).rejects.toThrow(WeakPasswordError);
    expect(users.users).toHaveLength(0);
  });
});
