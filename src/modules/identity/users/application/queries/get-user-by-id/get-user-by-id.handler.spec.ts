import { describe, expect, it } from 'vitest';
import { InMemoryUserRepository } from '../../../../../../../test/support/fakes/in-memory-user.repository';
import { User } from '../../../domain/entities/user';
import { UserNotFoundError } from '../../../domain/errors/user-not-found.error';
import { Email } from '../../../domain/value-objects/email';
import { PasswordHash } from '../../../domain/value-objects/password-hash';
import { PersonDocument } from '../../../domain/value-objects/person-document';
import { UserId } from '../../../domain/value-objects/user-id';
import { GetUserByIdHandler } from './get-user-by-id.handler';
import { GetUserByIdQuery } from './get-user-by-id.query';

const USER_ID = UserId.create('11111111-1111-4111-8111-111111111111');
const NOW = new Date('2026-08-31T12:00:00.000Z');

function buildUser(temporary = false): User {
  return User.register({
    id: USER_ID,
    email: Email.create('jane@example.com'),
    name: 'Jane Doe',
    document: PersonDocument.create('11144477735'),
    passwordHash: PasswordHash.create('hash'),
    temporary,
    now: NOW,
  });
}

function makeHandler() {
  const users = new InMemoryUserRepository();
  return { handler: new GetUserByIdHandler(users), users };
}

describe('GetUserByIdHandler', () => {
  it('maps the aggregate to the DTO, with createdAt as an ISO string and no password hash', async () => {
    const { handler, users } = makeHandler();
    await users.save(buildUser());

    const result = await handler.execute(new GetUserByIdQuery(USER_ID.value));

    expect(result).toEqual({
      id: USER_ID.value,
      email: 'jane@example.com',
      name: 'Jane Doe',
      status: 'ACTIVE',
      mustChangePassword: false,
      createdAt: NOW.toISOString(),
    });
  });

  it('carries the pending password flag of a staff account created with a temporary password', async () => {
    const { handler, users } = makeHandler();
    await users.save(buildUser(true));

    const result = await handler.execute(new GetUserByIdQuery(USER_ID.value));

    expect(result).toMatchObject({ mustChangePassword: true });
  });

  it('refuses an id nobody carries with the user not-found error', async () => {
    const { handler } = makeHandler();

    await expect(
      handler.execute(new GetUserByIdQuery('00000000-0000-4000-8000-000000000001')),
    ).rejects.toThrow(UserNotFoundError);
  });

  it('refuses a soft-deleted user with the user not-found error - the row still exists, the account does not', async () => {
    const { handler, users } = makeHandler();
    const user = buildUser();
    user.deactivate(NOW);
    await users.save(user);

    await expect(handler.execute(new GetUserByIdQuery(USER_ID.value))).rejects.toThrow(
      UserNotFoundError,
    );
  });

  it('refuses a malformed id with the user not-found error without reaching the repository', async () => {
    const { handler, users } = makeHandler();
    await users.save(buildUser());

    await expect(handler.execute(new GetUserByIdQuery('not-a-uuid'))).rejects.toThrow(
      UserNotFoundError,
    );
  });
});
