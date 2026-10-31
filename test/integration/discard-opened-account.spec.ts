import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { CryptoIdGenerator } from '../../src/shared/infrastructure/ids/crypto-id-generator';
import { TypeOrmTransactionRunner } from '../../src/shared/infrastructure/database/typeorm-transaction-runner';
import { SystemClock } from '../../src/shared/infrastructure/time/system-clock';
import { RefreshTokenOrmEntity } from '../../src/modules/identity/authentication/infrastructure/persistence/refresh-token.orm-entity';
import { SessionOrmEntity } from '../../src/modules/identity/authentication/infrastructure/persistence/session.orm-entity';
import { TypeOrmSessionRepository } from '../../src/modules/identity/authentication/infrastructure/persistence/typeorm-session.repository';
import { SessionRevocationReason } from '../../src/modules/identity/authentication/domain/session-revocation-reason';
import { AssignRoleToUserUseCase } from '../../src/modules/identity/authorization/application/commands/assign-role-to-user/assign-role-to-user.use-case';
import { GetUserEffectiveAccessUseCase } from '../../src/modules/identity/authorization/application/queries/get-user-effective-access/get-user-effective-access.use-case';
import { EffectiveAccessService } from '../../src/modules/identity/authorization/application/services/effective-access.service';
import { PermissionOrmEntity } from '../../src/modules/identity/authorization/infrastructure/persistence/permission.orm-entity';
import { RoleOrmEntity } from '../../src/modules/identity/authorization/infrastructure/persistence/role.orm-entity';
import { RolePermissionOrmEntity } from '../../src/modules/identity/authorization/infrastructure/persistence/role-permission.orm-entity';
import { TypeOrmAssignmentRepository } from '../../src/modules/identity/authorization/infrastructure/persistence/typeorm-assignment.repository';
import { TypeOrmEffectiveAccessReader } from '../../src/modules/identity/authorization/infrastructure/persistence/typeorm-effective-access.reader';
import { TypeOrmRoleRepository } from '../../src/modules/identity/authorization/infrastructure/persistence/typeorm-role.repository';
import { UserRoleOrmEntity } from '../../src/modules/identity/authorization/infrastructure/persistence/user-role.orm-entity';
import { DiscardOpenedAccountCommand } from '../../src/modules/identity/users/application/commands/discard-opened-account/discard-opened-account.command';
import { DiscardOpenedAccountUseCase } from '../../src/modules/identity/users/application/commands/discard-opened-account/discard-opened-account.use-case';
import { RegisterUserCommand } from '../../src/modules/identity/users/application/commands/register-user/register-user.command';
import { RegisterUserUseCase } from '../../src/modules/identity/users/application/commands/register-user/register-user.use-case';
import { GetUserByIdUseCase } from '../../src/modules/identity/users/application/queries/get-user-by-id/get-user-by-id.use-case';
import { AccountInUseError } from '../../src/modules/identity/users/domain/errors/account-in-use.error';
import { Email } from '../../src/modules/identity/users/domain/value-objects/email';
import { PersonDocument } from '../../src/modules/identity/users/domain/value-objects/person-document';
import { TypeOrmUserRepository } from '../../src/modules/identity/users/infrastructure/persistence/typeorm-user.repository';
import { UserOrmEntity } from '../../src/modules/identity/users/infrastructure/persistence/user.orm-entity';
import { uniqueValidCpf } from '../support/factories/document.factory';
import { buildSession } from '../support/factories/session.factory';
import { FakeAccessCache } from '../support/fakes/fake-access-cache';
import { FakePasswordHasher } from '../support/fakes/fake-password-hasher';
import { RecordingDomainEventPublisher } from '../support/fakes/recording-domain-event-publisher';
import { createTestDataSource } from '../support/db';

let dataSource: DataSource;
let users: TypeOrmUserRepository;
let sessions: TypeOrmSessionRepository;
let registerUser: RegisterUserUseCase;
let discard: DiscardOpenedAccountUseCase;

beforeAll(async () => {
  dataSource = createTestDataSource();
  await dataSource.initialize();
  users = new TypeOrmUserRepository(dataSource.getRepository(UserOrmEntity));
  sessions = new TypeOrmSessionRepository(
    dataSource.getRepository(SessionOrmEntity),
    dataSource.getRepository(RefreshTokenOrmEntity),
    dataSource,
  );
  const clock = new SystemClock();
  const events = new RecordingDomainEventPublisher();
  const assignRoleToUser = new AssignRoleToUserUseCase(
    new TypeOrmRoleRepository(
      dataSource.getRepository(RoleOrmEntity),
      dataSource.getRepository(RolePermissionOrmEntity),
      dataSource.getRepository(PermissionOrmEntity),
      dataSource,
    ),
    new TypeOrmAssignmentRepository(
      dataSource.getRepository(UserRoleOrmEntity),
      dataSource.getRepository(RoleOrmEntity),
      dataSource,
      clock,
    ),
    clock,
    new GetUserEffectiveAccessUseCase(
      new EffectiveAccessService(
        new FakeAccessCache(),
        new TypeOrmEffectiveAccessReader(dataSource),
      ),
    ),
    new GetUserByIdUseCase(users),
    events,
  );
  registerUser = new RegisterUserUseCase(
    users,
    new FakePasswordHasher(),
    new CryptoIdGenerator(),
    clock,
    new TypeOrmTransactionRunner(dataSource),
    assignRoleToUser,
    events,
  );
  discard = new DiscardOpenedAccountUseCase(users, sessions);
});

afterAll(async () => {
  await dataSource.destroy();
});

interface Account {
  userId: string;
  email: string;
  document: string;
}

// Opens an account the way customer registration does: staff-issued, under an id the caller chose.
async function openAccount(overrides: Partial<Account> = {}): Promise<Account> {
  const account = {
    userId: overrides.userId ?? randomUUID(),
    email: overrides.email ?? `${randomUUID()}@example.com`,
    document: overrides.document ?? uniqueValidCpf(),
  };
  await registerUser.execute(
    new RegisterUserCommand(
      account.email,
      'Jane Doe',
      undefined,
      account.document,
      true,
      account.userId,
    ),
  );
  return account;
}

async function userCount(userId: string): Promise<number> {
  const rows: Array<{ count: number }> = await dataSource.query(
    `SELECT count(*)::int AS count FROM users WHERE external_id = $1`,
    [userId],
  );
  return rows[0].count;
}

async function roleAssignmentCount(userInternalId: string): Promise<number> {
  const rows: Array<{ count: number }> = await dataSource.query(
    `SELECT count(*)::int AS count FROM user_roles WHERE user_id = $1`,
    [userInternalId],
  );
  return rows[0].count;
}

async function internalIdOf(userId: string): Promise<string> {
  const rows: Array<{ id: string }> = await dataSource.query(
    `SELECT id FROM users WHERE external_id = $1`,
    [userId],
  );
  return rows[0].id;
}

describe('opening an account under a chosen id and discarding it', () => {
  it('should store the user under the id the caller chose', async () => {
    const chosenId = randomUUID();

    const account = await openAccount({ userId: chosenId });

    expect(await userCount(chosenId)).toBe(1);
    expect((await users.findByEmail(Email.create(account.email)))?.id.value).toBe(chosenId);
  });

  it('should remove the user and its role assignment, and let the same email and document register again', async () => {
    const account = await openAccount();
    const internalId = await internalIdOf(account.userId);
    expect(await roleAssignmentCount(internalId)).toBe(1);

    await discard.execute(new DiscardOpenedAccountCommand(account.userId));

    expect(await userCount(account.userId)).toBe(0);
    expect(await roleAssignmentCount(internalId)).toBe(0);
    await expect(
      openAccount({ email: account.email, document: account.document }),
    ).resolves.toBeDefined();
    expect(await users.existsByEmail(Email.create(account.email))).toBe(true);
    expect(await users.existsByDocument(PersonDocument.create(account.document))).toBe(true);
  });

  it('should do nothing for a user that does not exist', async () => {
    await expect(
      discard.execute(new DiscardOpenedAccountCommand(randomUUID())),
    ).resolves.toBeUndefined();
  });

  it('should refuse a user with a session and keep the user and its role assignment', async () => {
    const account = await openAccount();
    const internalId = await internalIdOf(account.userId);
    await sessions.save(buildSession({ userId: account.userId, initialTokenHash: randomUUID() }));

    await expect(discard.execute(new DiscardOpenedAccountCommand(account.userId))).rejects.toThrow(
      AccountInUseError,
    );

    expect(await userCount(account.userId)).toBe(1);
    expect(await roleAssignmentCount(internalId)).toBe(1);
  });

  it('should refuse a user a customer points at and keep the user and its role assignment', async () => {
    const account = await openAccount();
    const internalId = await internalIdOf(account.userId);
    await dataSource.query(
      `INSERT INTO customers (external_id, user_id, status, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, 'ACTIVE', now(), now())`,
      [internalId],
    );

    await expect(discard.execute(new DiscardOpenedAccountCommand(account.userId))).rejects.toThrow(
      AccountInUseError,
    );

    expect(await userCount(account.userId)).toBe(1);
    expect(await roleAssignmentCount(internalId)).toBe(1);
  });

  it('should report a session of the user whatever its status, and none for a user without one or unknown', async () => {
    const withSession = await openAccount();
    const withoutSession = await openAccount();
    await sessions.save(
      buildSession({ userId: withSession.userId, initialTokenHash: randomUUID() }),
    );
    await sessions.revokeAllActiveByUserId(
      withSession.userId,
      SessionRevocationReason.LogoutAll,
      new Date(),
    );

    expect(await sessions.existsByUserId(withSession.userId)).toBe(true);
    expect(await sessions.existsByUserId(withoutSession.userId)).toBe(false);
    expect(await sessions.existsByUserId(randomUUID())).toBe(false);
  });
});
