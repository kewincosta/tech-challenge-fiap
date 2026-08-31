import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { RefreshTokenOrmEntity } from '../../src/modules/authentication/infrastructure/persistence/refresh-token.orm-entity';
import { SessionOrmEntity } from '../../src/modules/authentication/infrastructure/persistence/session.orm-entity';
import { TypeOrmSessionRepository } from '../../src/modules/authentication/infrastructure/persistence/typeorm-session.repository';
import { RefreshTokenStatus } from '../../src/modules/authentication/domain/refresh-token-status';
import { SessionRevocationReason } from '../../src/modules/authentication/domain/session-revocation-reason';
import { SessionStatus } from '../../src/modules/authentication/domain/session-status';
import { RefreshTokenHash } from '../../src/modules/authentication/domain/value-objects/refresh-token-hash';
import { RefreshTokenId } from '../../src/modules/authentication/domain/value-objects/refresh-token-id';
import { buildSession, SESSION_NOW } from '../support/factories/session.factory';
import { createTestDataSource } from '../support/db';

let dataSource: DataSource;
let repository: TypeOrmSessionRepository;

function uniqueHash(label: string): string {
  return `hash(${label}-${randomUUID()})`;
}

function uniqueDigits(length: number): string {
  let digits = '';
  while (digits.length < length) {
    digits += Math.floor(Math.random() * 10).toString();
  }
  return digits.slice(0, length);
}

// Users are created here through a raw insert rather than TypeOrmUserRepository, matching the
// existing pattern of test-only setup data going straight through SQL. UserOrmEntity does not
// yet declare `document` - that column reaches the domain in T9 - so it is supplied directly to
// satisfy the schema's NOT NULL constraint without pulling T9's scope into this test.
async function insertUser(): Promise<string> {
  const externalId = randomUUID();
  await dataSource.query(
    `INSERT INTO users (external_id, email, password_hash, name, document, status, created_at, updated_at)
     VALUES ($1, $2, 'hashed:Str0ngPassword', 'Jane Doe', $3, 'ACTIVE', $4, $4)`,
    [externalId, `${externalId}@example.com`, uniqueDigits(11), SESSION_NOW],
  );
  return externalId;
}

async function sessionInternalIdFor(externalSessionId: string): Promise<string> {
  const row = await dataSource
    .getRepository(SessionOrmEntity)
    .findOneOrFail({ where: { externalId: externalSessionId } });
  return row.id;
}

async function userInternalIdFor(externalUserId: string): Promise<string> {
  const rows: Array<{ id: string }> = await dataSource.query(
    `SELECT id FROM users WHERE external_id = $1`,
    [externalUserId],
  );
  return rows[0].id;
}

beforeAll(async () => {
  dataSource = createTestDataSource();
  await dataSource.initialize();
  repository = new TypeOrmSessionRepository(
    dataSource.getRepository(SessionOrmEntity),
    dataSource.getRepository(RefreshTokenOrmEntity),
    dataSource,
  );
});

afterAll(async () => {
  await dataSource.destroy();
});

describe('TypeOrmSessionRepository', () => {
  it('should persist a session with its refresh token and read it back', async () => {
    const userId = await insertUser();
    const tokenHash = uniqueHash('refresh-1');
    const session = buildSession({ userId, initialTokenHash: tokenHash });

    await repository.save(session);
    const found = await repository.findByRefreshTokenHash(RefreshTokenHash.create(tokenHash));

    expect(found?.id.value).toBe(session.id.value);
    expect(found?.userId).toBe(userId);
    expect(found?.activeToken.tokenHash.value).toBe(tokenHash);
  });

  it('should keep a single active refresh token per session after rotation', async () => {
    const userId = await insertUser();
    const firstHash = uniqueHash('refresh-1');
    const secondHash = uniqueHash('refresh-2');
    const session = buildSession({ userId, initialTokenHash: firstHash });
    await repository.save(session);

    session.rotateRefreshToken({
      presentedTokenHash: RefreshTokenHash.create(firstHash),
      newTokenId: RefreshTokenId.create(randomUUID()),
      newTokenHash: RefreshTokenHash.create(secondHash),
      refreshTokenTtlSeconds: 604800,
      now: new Date(SESSION_NOW.getTime() + 60000),
    });
    await repository.save(session);

    const sessionInternalId = await sessionInternalIdFor(session.id.value);
    const tokens = await dataSource
      .getRepository(RefreshTokenOrmEntity)
      .find({ where: { sessionInternalId } });
    const active = tokens.filter(
      (token) => (token.status as RefreshTokenStatus) === RefreshTokenStatus.Active,
    );
    expect(tokens).toHaveLength(2);
    expect(active).toHaveLength(1);
    expect(active[0].tokenHash).toBe(secondHash);
  });

  it('should not find a session by a rotated token hash through the active lookup', async () => {
    const userId = await insertUser();
    const firstHash = uniqueHash('refresh-1');
    const session = buildSession({ userId, initialTokenHash: firstHash });
    await repository.save(session);
    session.rotateRefreshToken({
      presentedTokenHash: RefreshTokenHash.create(firstHash),
      newTokenId: RefreshTokenId.create(randomUUID()),
      newTokenHash: RefreshTokenHash.create(uniqueHash('refresh-2')),
      refreshTokenTtlSeconds: 604800,
      now: new Date(SESSION_NOW.getTime() + 60000),
    });
    await repository.save(session);

    const reloaded = await repository.findByRefreshTokenHash(RefreshTokenHash.create(firstHash));

    expect(reloaded?.tokens[0].status).toBe(RefreshTokenStatus.Rotated);
  });

  it('should revoke every active session of a user in bulk', async () => {
    const userId = await insertUser();
    const otherUserId = await insertUser();
    await repository.save(buildSession({ userId, initialTokenHash: uniqueHash('a') }));
    await repository.save(buildSession({ userId, initialTokenHash: uniqueHash('b') }));
    const foreignSession = buildSession({
      userId: otherUserId,
      initialTokenHash: uniqueHash('c'),
    });
    await repository.save(foreignSession);

    const revokedIds = await repository.revokeAllActiveByUserId(
      userId,
      SessionRevocationReason.LogoutAll,
      new Date(SESSION_NOW.getTime() + 60000),
    );

    expect(revokedIds).toHaveLength(2);
    const ownerInternalId = await userInternalIdFor(userId);
    const ownerActive = await dataSource
      .getRepository(SessionOrmEntity)
      .count({ where: { userInternalId: ownerInternalId, status: SessionStatus.Active } });
    expect(ownerActive).toBe(0);
    const otherInternalId = await userInternalIdFor(otherUserId);
    const foreignActive = await dataSource
      .getRepository(SessionOrmEntity)
      .count({ where: { userInternalId: otherInternalId, status: SessionStatus.Active } });
    expect(foreignActive).toBe(1);
    const foreignSessionInternalId = await sessionInternalIdFor(foreignSession.id.value);
    const foreignActiveTokens = await dataSource.getRepository(RefreshTokenOrmEntity).count({
      where: { sessionInternalId: foreignSessionInternalId, status: RefreshTokenStatus.Active },
    });
    expect(foreignActiveTokens).toBe(1);
  });
});
