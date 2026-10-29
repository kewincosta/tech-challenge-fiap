import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource, EntityManager } from 'typeorm';
import { UserKeyResolver } from '../../src/modules/identity';
import {
  currentEntityManager,
  TypeOrmTransactionRunner,
} from '../../src/shared/infrastructure/database/typeorm-transaction-runner';
import { uniqueValidCpf } from '../support/factories/document.factory';
import { createTestDataSource } from '../support/db';

// The largest bigint: no sequence in the test database gets there, so no user owns it.
const UNKNOWN_INTERNAL_ID = '9223372036854775807';

let dataSource: DataSource;
let resolver: UserKeyResolver;

beforeAll(async () => {
  dataSource = createTestDataSource();
  await dataSource.initialize();
  resolver = new UserKeyResolver(dataSource);
});

afterAll(async () => {
  await dataSource.destroy();
});

interface UserKeys {
  id: string;
  externalId: string;
}

// A raw insert returns the internal key from the database itself, so no expected value depends on
// the resolver under test.
async function insertUser(
  runner: DataSource | EntityManager,
  { deactivated = false } = {},
): Promise<UserKeys> {
  const externalId = randomUUID();
  const rows: Array<{ id: string }> = await runner.query(
    `INSERT INTO users (external_id, email, password_hash, name, document, status, created_at, updated_at, deleted_at)
     VALUES ($1, $2, 'hash', 'Test User', $3, $4, now(), now(), $5)
     RETURNING id`,
    [
      externalId,
      `${externalId}@example.com`,
      uniqueValidCpf(),
      deactivated ? 'INACTIVE' : 'ACTIVE',
      deactivated ? new Date() : null,
    ],
  );
  return { id: rows[0].id, externalId };
}

describe('UserKeyResolver', () => {
  it('translates a user external id into its internal key', async () => {
    const user = await insertUser(dataSource);

    expect(await resolver.toInternalId(user.externalId)).toBe(user.id);
  });

  it('translates an internal key into the user external id', async () => {
    const user = await insertUser(dataSource);

    expect(await resolver.toExternalId(user.id)).toBe(user.externalId);
  });

  it('answers null for a key that belongs to no user, in both directions', async () => {
    expect(await resolver.toInternalId(randomUUID())).toBeNull();
    expect(await resolver.toExternalId(UNKNOWN_INTERNAL_ID)).toBeNull();
  });

  it('translates a batch of external ids and leaves the unknown ones out', async () => {
    const first = await insertUser(dataSource);
    const second = await insertUser(dataSource);

    const internalIds = await resolver.toInternalIds([
      first.externalId,
      randomUUID(),
      second.externalId,
      first.externalId,
    ]);

    expect(internalIds).toEqual(
      new Map([
        [first.externalId, first.id],
        [second.externalId, second.id],
      ]),
    );
  });

  it('translates a batch of internal keys and leaves the unknown ones out', async () => {
    const first = await insertUser(dataSource);
    const second = await insertUser(dataSource);

    const externalIds = await resolver.toExternalIds([
      first.id,
      UNKNOWN_INTERNAL_ID,
      second.id,
      first.id,
    ]);

    expect(externalIds).toEqual(
      new Map([
        [first.id, first.externalId],
        [second.id, second.externalId],
      ]),
    );
  });

  it('resolves a deactivated user in every form', async () => {
    const user = await insertUser(dataSource, { deactivated: true });

    expect(await resolver.toInternalId(user.externalId)).toBe(user.id);
    expect(await resolver.toExternalId(user.id)).toBe(user.externalId);
    expect(await resolver.toInternalIds([user.externalId])).toEqual(
      new Map([[user.externalId, user.id]]),
    );
    expect(await resolver.toExternalIds([user.id])).toEqual(new Map([[user.id, user.externalId]]));
  });

  // The fixture is written and read inside one transaction that is rolled back at the end: a
  // resolver that reads on its own connection cannot see the uncommitted row, and nothing is left
  // behind for a later test.
  it('resolves a user inserted earlier in the same open transaction', async () => {
    const runner = new TypeOrmTransactionRunner(dataSource);
    const rollback = new Error('discard the fixture');
    let user!: UserKeys;
    let inside!: {
      internalId: string | null;
      externalId: string | null;
      internalIds: Map<string, string>;
      externalIds: Map<string, string>;
    };

    await expect(
      runner.run(async () => {
        user = await insertUser(currentEntityManager()!);
        inside = {
          internalId: await resolver.toInternalId(user.externalId),
          externalId: await resolver.toExternalId(user.id),
          internalIds: await resolver.toInternalIds([user.externalId]),
          externalIds: await resolver.toExternalIds([user.id]),
        };
        throw rollback;
      }),
    ).rejects.toThrow(rollback);

    expect(inside.internalId).toBe(user.id);
    expect(inside.externalId).toBe(user.externalId);
    expect(inside.internalIds).toEqual(new Map([[user.externalId, user.id]]));
    expect(inside.externalIds).toEqual(new Map([[user.id, user.externalId]]));
    expect(await resolver.toInternalId(user.externalId)).toBeNull();
  });
});
