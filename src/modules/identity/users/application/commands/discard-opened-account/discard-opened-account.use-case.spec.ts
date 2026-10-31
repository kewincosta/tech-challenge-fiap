import { describe, expect, it } from 'vitest';
import { InMemorySessionRepository } from '../../../../../../../test/support/fakes/in-memory-session.repository';
import { InMemoryUserRepository } from '../../../../../../../test/support/fakes/in-memory-user.repository';
import { buildSession } from '../../../../../../../test/support/factories/session.factory';
import { buildUser } from '../../../../../../../test/support/factories/user.factory';
import { AccountInUseError } from '../../../domain/errors/account-in-use.error';
import { DiscardOpenedAccountCommand } from './discard-opened-account.command';
import { DiscardOpenedAccountUseCase } from './discard-opened-account.use-case';

const OPENED_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';

async function makeUseCase() {
  const users = new InMemoryUserRepository();
  const sessions = new InMemorySessionRepository();
  await users.save(buildUser({ id: OPENED_ID }));
  await users.save(buildUser({ id: OTHER_ID }));
  const useCase = new DiscardOpenedAccountUseCase(users, sessions);
  return { useCase, users, sessions };
}

describe('DiscardOpenedAccountUseCase', () => {
  it('deletes the user and keeps every other', async () => {
    const { useCase, users } = await makeUseCase();

    await useCase.execute(new DiscardOpenedAccountCommand(OPENED_ID));

    expect(users.users.map((user) => user.id.value)).toEqual([OTHER_ID]);
  });

  it('does nothing for a user that does not exist', async () => {
    const { useCase, users } = await makeUseCase();

    await useCase.execute(new DiscardOpenedAccountCommand('33333333-3333-4333-8333-333333333333'));

    expect(users.users.map((user) => user.id.value)).toEqual([OPENED_ID, OTHER_ID]);
  });

  it('does nothing the second time', async () => {
    const { useCase, users } = await makeUseCase();
    await useCase.execute(new DiscardOpenedAccountCommand(OPENED_ID));

    await useCase.execute(new DiscardOpenedAccountCommand(OPENED_ID));

    expect(users.users.map((user) => user.id.value)).toEqual([OTHER_ID]);
  });

  it('refuses a user with a session and keeps the user', async () => {
    const { useCase, users, sessions } = await makeUseCase();
    await sessions.save(buildSession({ userId: OPENED_ID }));

    await expect(useCase.execute(new DiscardOpenedAccountCommand(OPENED_ID))).rejects.toThrow(
      AccountInUseError,
    );

    expect(users.users.map((user) => user.id.value)).toEqual([OPENED_ID, OTHER_ID]);
  });

  it('refuses a user a record of another module points at and keeps the user', async () => {
    const { useCase, users } = await makeUseCase();
    users.referenced.add(OPENED_ID);

    await expect(useCase.execute(new DiscardOpenedAccountCommand(OPENED_ID))).rejects.toThrow(
      AccountInUseError,
    );

    expect(users.users.map((user) => user.id.value)).toEqual([OPENED_ID, OTHER_ID]);
  });
});
