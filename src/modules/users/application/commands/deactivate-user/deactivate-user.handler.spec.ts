import { describe, expect, it } from 'vitest';
import { stubCommandBus, stubEventBus } from '../../../../../../test/support/fakes/bus.stubs';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { InMemoryUserRepository } from '../../../../../../test/support/fakes/in-memory-user.repository';
import { buildUser } from '../../../../../../test/support/factories/user.factory';
import { LogoutAllSessionsCommand } from '../../../../authentication/application/commands/logout-all-sessions/logout-all-sessions.command';
import { UserNotFoundError } from '../../../domain/errors/user-not-found.error';
import { UserStatus } from '../../../domain/user-status';
import { DeactivateUserCommand } from './deactivate-user.command';
import { DeactivateUserHandler } from './deactivate-user.handler';

function makeHandler() {
  const users = new InMemoryUserRepository();
  const eventBus = stubEventBus();
  const commandBus = stubCommandBus();
  const clock = new FakeClock();
  const handler = new DeactivateUserHandler(users, clock, eventBus.bus, commandBus.bus);
  return { handler, users, eventBus, commandBus, clock };
}

describe('DeactivateUserHandler', () => {
  it('should deactivate the user and soft delete it', async () => {
    const { handler, users, clock } = makeHandler();
    const user = buildUser({ email: 'jane@example.com', document: '11144477735' });
    await users.save(user);

    await handler.execute(new DeactivateUserCommand(user.id.value));

    const saved = users.users.find((u) => u.id.equals(user.id));
    expect(saved?.status).toBe(UserStatus.Inactive);
    expect(saved?.deletedAt).toEqual(clock.now());
  });

  it('should free the email and document for reuse by a new registration', async () => {
    const { handler, users } = makeHandler();
    const user = buildUser({ email: 'jane@example.com', document: '11144477735' });
    await users.save(user);

    await handler.execute(new DeactivateUserCommand(user.id.value));

    const newUser = buildUser({ email: 'jane@example.com', document: '11144477735' });
    expect(await users.existsByEmail(newUser.email)).toBe(false);
    expect(await users.existsByDocument(newUser.document)).toBe(false);
  });

  it('should throw when the user does not exist', async () => {
    const { handler } = makeHandler();

    await expect(
      handler.execute(new DeactivateUserCommand('00000000-0000-4000-8000-000000000001')),
    ).rejects.toThrow(UserNotFoundError);
  });

  it('should revoke every active session of the deactivated user', async () => {
    const { handler, users, commandBus } = makeHandler();
    const user = buildUser({ email: 'jane@example.com', document: '11144477735' });
    await users.save(user);

    await handler.execute(new DeactivateUserCommand(user.id.value));

    expect(commandBus.execute).toHaveBeenCalledWith(new LogoutAllSessionsCommand(user.id.value));
  });
});
