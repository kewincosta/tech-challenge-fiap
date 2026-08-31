import { describe, expect, it } from 'vitest';
import { stubCommandBus } from '../../../../../../test/support/fakes/bus.stubs';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { FakePasswordHasher } from '../../../../../../test/support/fakes/fake-password-hasher';
import { InMemoryUserRepository } from '../../../../../../test/support/fakes/in-memory-user.repository';
import { buildUser } from '../../../../../../test/support/factories/user.factory';
import { LogoutAllSessionsCommand } from '../../../../authentication/application/commands/logout-all-sessions/logout-all-sessions.command';
import { InvalidCredentialsError } from '../../../../authentication/domain/errors/invalid-credentials.error';
import { WeakPasswordError } from '../../../domain/errors/weak-password.error';
import { ChangePasswordCommand } from './change-password.command';
import { ChangePasswordHandler } from './change-password.handler';

function makeHandler() {
  const users = new InMemoryUserRepository();
  const passwordHasher = new FakePasswordHasher();
  const clock = new FakeClock();
  const commandBus = stubCommandBus();
  const handler = new ChangePasswordHandler(users, passwordHasher, clock, commandBus.bus);
  return { handler, users, passwordHasher, clock, commandBus };
}

describe('ChangePasswordHandler', () => {
  it('should change the password when the current password matches', async () => {
    const { handler, users } = makeHandler();
    const user = buildUser({ passwordHash: 'hashed:OldPassword1' });
    await users.save(user);

    await handler.execute(new ChangePasswordCommand(user.id.value, 'OldPassword1', 'NewPassword2'));

    const saved = users.users.find((u) => u.id.equals(user.id));
    expect(saved?.passwordHash.value).toBe('hashed:NewPassword2');
  });

  it('should reject a wrong current password', async () => {
    const { handler, users } = makeHandler();
    const user = buildUser({ passwordHash: 'hashed:OldPassword1' });
    await users.save(user);

    await expect(
      handler.execute(new ChangePasswordCommand(user.id.value, 'WrongPassword1', 'NewPassword2')),
    ).rejects.toThrow(InvalidCredentialsError);
  });

  it('should reject a weak new password', async () => {
    const { handler, users } = makeHandler();
    const user = buildUser({ passwordHash: 'hashed:OldPassword1' });
    await users.save(user);

    await expect(
      handler.execute(new ChangePasswordCommand(user.id.value, 'OldPassword1', 'short')),
    ).rejects.toThrow(WeakPasswordError);
  });

  it('should clear the pending password flag on success', async () => {
    const { handler, users } = makeHandler();
    const user = buildUser({ passwordHash: 'hashed:OldPassword1', temporary: true });
    await users.save(user);

    await handler.execute(new ChangePasswordCommand(user.id.value, 'OldPassword1', 'NewPassword2'));

    const saved = users.users.find((u) => u.id.equals(user.id));
    expect(saved?.mustChangePassword).toBe(false);
  });

  it('should revoke every session of the user on success', async () => {
    const { handler, users, commandBus } = makeHandler();
    const user = buildUser({ passwordHash: 'hashed:OldPassword1' });
    await users.save(user);

    await handler.execute(new ChangePasswordCommand(user.id.value, 'OldPassword1', 'NewPassword2'));

    expect(commandBus.execute).toHaveBeenCalledWith(new LogoutAllSessionsCommand(user.id.value));
  });
});
