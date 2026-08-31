import { describe, expect, it } from 'vitest';
import { stubEventBus } from '../../../../../../test/support/fakes/bus.stubs';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { InMemoryUserRepository } from '../../../../../../test/support/fakes/in-memory-user.repository';
import { buildUser } from '../../../../../../test/support/factories/user.factory';
import { DocumentAlreadyInUseError } from '../../../domain/errors/document-already-in-use.error';
import { EmailAlreadyInUseError } from '../../../domain/errors/email-already-in-use.error';
import { InvalidPersonDocumentError } from '../../../domain/errors/invalid-person-document.error';
import { UserNotFoundError } from '../../../domain/errors/user-not-found.error';
import { UpdateUserCommand } from './update-user.command';
import { UpdateUserHandler } from './update-user.handler';

function makeHandler() {
  const users = new InMemoryUserRepository();
  const eventBus = stubEventBus();
  const handler = new UpdateUserHandler(users, new FakeClock(), eventBus.bus);
  return { handler, users, eventBus };
}

describe('UpdateUserHandler', () => {
  it('should update the name, email and document, each revalidated', async () => {
    const { handler, users } = makeHandler();
    const user = buildUser({ name: 'Jane Doe', email: 'jane@example.com', document: '11144477735' });
    await users.save(user);

    await handler.execute(
      new UpdateUserCommand(user.id.value, 'Jane Updated', 'updated@example.com', '52998224725'),
    );

    const saved = users.users[0];
    expect(saved.name).toBe('Jane Updated');
    expect(saved.email.value).toBe('updated@example.com');
    expect(saved.document.value).toBe('52998224725');
  });

  it('should update only the fields supplied', async () => {
    const { handler, users } = makeHandler();
    const user = buildUser({ name: 'Jane Doe', email: 'jane@example.com', document: '11144477735' });
    await users.save(user);

    await handler.execute(new UpdateUserCommand(user.id.value, 'Jane Renamed'));

    const saved = users.users[0];
    expect(saved.name).toBe('Jane Renamed');
    expect(saved.email.value).toBe('jane@example.com');
    expect(saved.document.value).toBe('11144477735');
  });

  it('should allow updating to the email and document the user already has', async () => {
    const { handler, users } = makeHandler();
    const user = buildUser({ email: 'jane@example.com', document: '11144477735' });
    await users.save(user);

    await expect(
      handler.execute(new UpdateUserCommand(user.id.value, undefined, 'jane@example.com', '11144477735')),
    ).resolves.toBeUndefined();
  });

  it('should not update to an email already in use by another user', async () => {
    const { handler, users } = makeHandler();
    const user = buildUser({ email: 'jane@example.com', document: '11144477735' });
    const other = buildUser({ email: 'other@example.com', document: '52998224725' });
    await users.save(user);
    await users.save(other);

    await expect(
      handler.execute(new UpdateUserCommand(user.id.value, undefined, 'other@example.com')),
    ).rejects.toThrow(EmailAlreadyInUseError);
    expect(users.users.find((u) => u.id.equals(user.id))?.email.value).toBe('jane@example.com');
  });

  it('should not update to a document already in use by another user', async () => {
    const { handler, users } = makeHandler();
    const user = buildUser({ email: 'jane@example.com', document: '11144477735' });
    const other = buildUser({ email: 'other@example.com', document: '52998224725' });
    await users.save(user);
    await users.save(other);

    await expect(
      handler.execute(new UpdateUserCommand(user.id.value, undefined, undefined, '52998224725')),
    ).rejects.toThrow(DocumentAlreadyInUseError);
    expect(users.users.find((u) => u.id.equals(user.id))?.document.value).toBe('11144477735');
  });

  it('should not update a user with an invalid document', async () => {
    const { handler, users } = makeHandler();
    const user = buildUser();
    await users.save(user);

    await expect(
      handler.execute(new UpdateUserCommand(user.id.value, undefined, undefined, '11111111111')),
    ).rejects.toThrow(InvalidPersonDocumentError);
  });

  it('should throw when the user does not exist', async () => {
    const { handler } = makeHandler();

    await expect(
      handler.execute(new UpdateUserCommand('00000000-0000-4000-8000-000000000001', 'New Name')),
    ).rejects.toThrow(UserNotFoundError);
  });
});
