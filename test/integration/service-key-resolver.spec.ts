import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource, EntityManager } from 'typeorm';
import { ServiceKeyResolver } from '../../src/modules/services';
import {
  currentEntityManager,
  TypeOrmTransactionRunner,
} from '../../src/shared/infrastructure/database/typeorm-transaction-runner';
import { uniqueServiceName } from '../support/factories/service.factory';
import { createTestDataSource } from '../support/db';

// The largest bigint: no sequence in the test database gets there, so no service owns it.
const UNKNOWN_INTERNAL_ID = '9223372036854775807';

let dataSource: DataSource;
let resolver: ServiceKeyResolver;

beforeAll(async () => {
  dataSource = createTestDataSource();
  await dataSource.initialize();
  resolver = new ServiceKeyResolver(dataSource);
});

afterAll(async () => {
  await dataSource.destroy();
});

interface ServiceKeys {
  id: string;
  externalId: string;
}

// A raw insert returns the internal key from the database itself, so no expected value depends on
// the resolver under test.
async function insertService(
  runner: DataSource | EntityManager,
  { deactivated = false } = {},
): Promise<ServiceKeys> {
  const externalId = randomUUID();
  const rows: Array<{ id: string }> = await runner.query(
    `INSERT INTO services (external_id, name, price_cents, estimated_duration_minutes, status, created_at, updated_at)
     VALUES ($1, $2, 15000, 60, $3, now(), now())
     RETURNING id`,
    [externalId, uniqueServiceName(), deactivated ? 'INACTIVE' : 'ACTIVE'],
  );
  return { id: rows[0].id, externalId };
}

describe('ServiceKeyResolver', () => {
  it('translates a service external id into its internal key', async () => {
    const service = await insertService(dataSource);

    expect(await resolver.toInternalId(service.externalId)).toBe(service.id);
  });

  it('translates an internal key into the service external id', async () => {
    const service = await insertService(dataSource);

    expect(await resolver.toExternalId(service.id)).toBe(service.externalId);
  });

  it('answers null for a key that belongs to no service, in both directions', async () => {
    expect(await resolver.toInternalId(randomUUID())).toBeNull();
    expect(await resolver.toExternalId(UNKNOWN_INTERNAL_ID)).toBeNull();
  });

  it('translates a batch of external ids and leaves the unknown ones out', async () => {
    const first = await insertService(dataSource);
    const second = await insertService(dataSource);

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
    const first = await insertService(dataSource);
    const second = await insertService(dataSource);

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

  it('resolves a deactivated service in every form', async () => {
    const service = await insertService(dataSource, { deactivated: true });

    expect(await resolver.toInternalId(service.externalId)).toBe(service.id);
    expect(await resolver.toExternalId(service.id)).toBe(service.externalId);
    expect(await resolver.toInternalIds([service.externalId])).toEqual(
      new Map([[service.externalId, service.id]]),
    );
    expect(await resolver.toExternalIds([service.id])).toEqual(
      new Map([[service.id, service.externalId]]),
    );
  });

  // The fixture is written and read inside one transaction that is rolled back at the end: a
  // resolver that reads on its own connection cannot see the uncommitted row, and nothing is left
  // behind for a later test.
  it('resolves a service inserted earlier in the same open transaction', async () => {
    const runner = new TypeOrmTransactionRunner(dataSource);
    const rollback = new Error('discard the fixture');
    let service!: ServiceKeys;
    let inside!: {
      internalId: string | null;
      externalId: string | null;
      internalIds: Map<string, string>;
      externalIds: Map<string, string>;
    };

    await expect(
      runner.run(async () => {
        service = await insertService(currentEntityManager()!);
        inside = {
          internalId: await resolver.toInternalId(service.externalId),
          externalId: await resolver.toExternalId(service.id),
          internalIds: await resolver.toInternalIds([service.externalId]),
          externalIds: await resolver.toExternalIds([service.id]),
        };
        throw rollback;
      }),
    ).rejects.toThrow(rollback);

    expect(inside.internalId).toBe(service.id);
    expect(inside.externalId).toBe(service.externalId);
    expect(inside.internalIds).toEqual(new Map([[service.externalId, service.id]]));
    expect(inside.externalIds).toEqual(new Map([[service.id, service.externalId]]));
    expect(await resolver.toInternalId(service.externalId)).toBeNull();
  });
});
