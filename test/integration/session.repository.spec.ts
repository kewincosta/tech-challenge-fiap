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
import { UserOrmEntity } from '../../src/modules/users/infrastructure/persistence/user.orm-entity';
import { buildSession, SESSION_NOW } from '../support/factories/session.factory';
import { createTestDataSource } from '../support/db';

let dataSource: DataSource;
let repository: TypeOrmSessionRepository;

function uniqueHash(label: string): string {
  return `hash(${label}-${randomUUID()})`;
}

async function insertUser(): Promise<string> {
  const id = randomUUID();
  await dataSource.getRepository(UserOrmEntity).save({
    id,
    email: `${id}@example.com`,
    passwordHash: 'hashed:Str0ngPassword',
    name: 'Jane Doe',
    status: 'ACTIVE',
    createdAt: SESSION_NOW,
    updatedAt: SESSION_NOW,
    deletedAt: null,
  });
  return id;
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

    const tokens = await dataSource
      .getRepository(RefreshTokenOrmEntity)
      .find({ where: { sessionId: session.id.value } });
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
    const ownerActive = await dataSource
      .getRepository(SessionOrmEntity)
      .count({ where: { userId, status: SessionStatus.Active } });
    expect(ownerActive).toBe(0);
    const foreignActive = await dataSource
      .getRepository(SessionOrmEntity)
      .count({ where: { userId: otherUserId, status: SessionStatus.Active } });
    expect(foreignActive).toBe(1);
    const foreignActiveTokens = await dataSource
      .getRepository(RefreshTokenOrmEntity)
      .count({ where: { sessionId: foreignSession.id.value, status: RefreshTokenStatus.Active } });
    expect(foreignActiveTokens).toBe(1);
  });
});
