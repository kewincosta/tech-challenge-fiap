import { describe, expect, it } from 'vitest';
import { FakePasswordHasher } from '../../../../../../test/support/fakes/fake-password-hasher';
import { InMemoryUserRepository } from '../../../../../../test/support/fakes/in-memory-user.repository';
import { buildUser } from '../../../../../../test/support/factories/user.factory';
import { VerifyCredentialsHandler } from './verify-credentials.handler';
import { VerifyCredentialsQuery } from './verify-credentials.query';

function makeHandler() {
  const users = new InMemoryUserRepository();
  const hasher = new FakePasswordHasher();
  const handler = new VerifyCredentialsHandler(users, hasher);
  return { handler, users, hasher };
}

describe('VerifyCredentialsHandler', () => {
  it('should return the user id for valid credentials', async () => {
    const { handler, users } = makeHandler();
    const user = buildUser({ email: 'jane@example.com', passwordHash: 'hashed:Str0ngPassword' });
    await users.save(user);

    const result = await handler.execute(
      new VerifyCredentialsQuery('jane@example.com', 'Str0ngPassword'),
    );

    expect(result).toEqual({ userId: user.id.value });
  });

  it('should reject invalid credentials', async () => {
    const { handler, users } = makeHandler();
    await users.save(
      buildUser({ email: 'jane@example.com', passwordHash: 'hashed:Str0ngPassword' }),
    );

    const result = await handler.execute(
      new VerifyCredentialsQuery('jane@example.com', 'WrongPassword1'),
    );

    expect(result).toBeNull();
  });

  it('should verify a placeholder hash for an unknown email to equalize timing', async () => {
    const { handler, hasher } = makeHandler();

    const result = await handler.execute(
      new VerifyCredentialsQuery('ghost@example.com', 'Str0ngPassword'),
    );

    expect(result).toBeNull();
    expect(hasher.verifyCalls).toHaveLength(1);
  });

  it('should not authenticate a deactivated user', async () => {
    const { handler, users } = makeHandler();
    const user = buildUser({ email: 'jane@example.com', passwordHash: 'hashed:Str0ngPassword' });
    user.deactivate(new Date('2026-08-26T13:00:00.000Z'));
    await users.save(user);

    const result = await handler.execute(
      new VerifyCredentialsQuery('jane@example.com', 'Str0ngPassword'),
    );

    expect(result).toBeNull();
  });
});
