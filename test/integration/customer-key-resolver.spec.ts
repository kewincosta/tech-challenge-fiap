import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource, EntityManager } from 'typeorm';
import { CustomerKeyResolver } from '../../src/modules/customers';
import {
  currentEntityManager,
  TypeOrmTransactionRunner,
} from '../../src/shared/infrastructure/database/typeorm-transaction-runner';
import { uniqueValidCpf } from '../support/factories/document.factory';
import { createTestDataSource } from '../support/db';

// The largest bigint: no sequence in the test database gets there, so no customer owns it.
const UNKNOWN_INTERNAL_ID = '9223372036854775807';

let dataSource: DataSource;
let resolver: CustomerKeyResolver;

beforeAll(async () => {
  dataSource = createTestDataSource();
  await dataSource.initialize();
  resolver = new CustomerKeyResolver(dataSource);
});

afterAll(async () => {
  await dataSource.destroy();
});

interface CustomerKeys {
  id: string;
  externalId: string;
}

async function insertUser(runner: DataSource | EntityManager): Promise<string> {
  const externalId = randomUUID();
  const rows: Array<{ id: string }> = await runner.query(
    `INSERT INTO users (external_id, email, password_hash, name, document, status, created_at, updated_at)
     VALUES ($1, $2, 'hash', 'Test User', $3, 'ACTIVE', now(), now())
     RETURNING id`,
    [externalId, `${externalId}@example.com`, uniqueValidCpf()],
  );
  return rows[0].id;
}

// A raw insert returns the internal key from the database itself, so no expected value depends on
// the resolver under test. Each customer gets a user of its own: customers.user_id is unique.
async function insertCustomer(
  runner: DataSource | EntityManager,
  { deactivated = false } = {},
): Promise<CustomerKeys> {
  const userId = await insertUser(runner);
  const externalId = randomUUID();
  const rows: Array<{ id: string }> = await runner.query(
    `INSERT INTO customers (external_id, user_id, status, created_at, updated_at, deleted_at)
     VALUES ($1, $2, $3, now(), now(), $4)
     RETURNING id`,
    [externalId, userId, deactivated ? 'INACTIVE' : 'ACTIVE', deactivated ? new Date() : null],
  );
  return { id: rows[0].id, externalId };
}

describe('CustomerKeyResolver', () => {
  it('translates a customer external id into its internal key', async () => {
    const customer = await insertCustomer(dataSource);

    expect(await resolver.toInternalId(customer.externalId)).toBe(customer.id);
  });

  it('translates an internal key into the customer external id', async () => {
    const customer = await insertCustomer(dataSource);

    expect(await resolver.toExternalId(customer.id)).toBe(customer.externalId);
  });

  it('answers null for a key that belongs to no customer, in both directions', async () => {
    expect(await resolver.toInternalId(randomUUID())).toBeNull();
    expect(await resolver.toExternalId(UNKNOWN_INTERNAL_ID)).toBeNull();
  });

  it('translates a batch of external ids and leaves the unknown ones out', async () => {
    const first = await insertCustomer(dataSource);
    const second = await insertCustomer(dataSource);

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
    const first = await insertCustomer(dataSource);
    const second = await insertCustomer(dataSource);

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

  it('resolves a deactivated customer in every form', async () => {
    const customer = await insertCustomer(dataSource, { deactivated: true });

    expect(await resolver.toInternalId(customer.externalId)).toBe(customer.id);
    expect(await resolver.toExternalId(customer.id)).toBe(customer.externalId);
    expect(await resolver.toInternalIds([customer.externalId])).toEqual(
      new Map([[customer.externalId, customer.id]]),
    );
    expect(await resolver.toExternalIds([customer.id])).toEqual(
      new Map([[customer.id, customer.externalId]]),
    );
  });

  // The fixture is written and read inside one transaction that is rolled back at the end: a
  // resolver that reads on its own connection cannot see the uncommitted row, and nothing is left
  // behind for a later test.
  it('resolves a customer inserted earlier in the same open transaction', async () => {
    const runner = new TypeOrmTransactionRunner(dataSource);
    const rollback = new Error('discard the fixture');
    let customer!: CustomerKeys;
    let inside!: {
      internalId: string | null;
      externalId: string | null;
      internalIds: Map<string, string>;
      externalIds: Map<string, string>;
    };

    await expect(
      runner.run(async () => {
        customer = await insertCustomer(currentEntityManager()!);
        inside = {
          internalId: await resolver.toInternalId(customer.externalId),
          externalId: await resolver.toExternalId(customer.id),
          internalIds: await resolver.toInternalIds([customer.externalId]),
          externalIds: await resolver.toExternalIds([customer.id]),
        };
        throw rollback;
      }),
    ).rejects.toThrow(rollback);

    expect(inside.internalId).toBe(customer.id);
    expect(inside.externalId).toBe(customer.externalId);
    expect(inside.internalIds).toEqual(new Map([[customer.externalId, customer.id]]));
    expect(inside.externalIds).toEqual(new Map([[customer.id, customer.externalId]]));
    expect(await resolver.toInternalId(customer.externalId)).toBeNull();
  });
});
