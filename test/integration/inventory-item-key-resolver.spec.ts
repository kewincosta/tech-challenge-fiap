import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource, EntityManager } from 'typeorm';
import { InventoryItemKeyResolver } from '../../src/modules/inventory';
import {
  currentEntityManager,
  TypeOrmTransactionRunner,
} from '../../src/shared/infrastructure/database/typeorm-transaction-runner';
import { uniqueSku } from '../support/factories/sku.factory';
import { createTestDataSource } from '../support/db';

// The largest bigint: no sequence in the test database gets there, so no inventory item owns it.
const UNKNOWN_INTERNAL_ID = '9223372036854775807';

let dataSource: DataSource;
let resolver: InventoryItemKeyResolver;

beforeAll(async () => {
  dataSource = createTestDataSource();
  await dataSource.initialize();
  resolver = new InventoryItemKeyResolver(dataSource);
});

afterAll(async () => {
  await dataSource.destroy();
});

interface InventoryItemKeys {
  id: string;
  externalId: string;
}

// A raw insert returns the internal key from the database itself, so no expected value depends on
// the resolver under test.
async function insertInventoryItem(
  runner: DataSource | EntityManager,
  { deactivated = false } = {},
): Promise<InventoryItemKeys> {
  const externalId = randomUUID();
  const rows: Array<{ id: string }> = await runner.query(
    `INSERT INTO inventory_items (external_id, sku, name, kind, unit_price_cents, quantity_on_hand, status, created_at, updated_at)
     VALUES ($1, $2, 'Item de teste', 'PART', 2500, 0, $3, now(), now())
     RETURNING id`,
    [externalId, uniqueSku(), deactivated ? 'INACTIVE' : 'ACTIVE'],
  );
  return { id: rows[0].id, externalId };
}

describe('InventoryItemKeyResolver', () => {
  it('translates an inventory item external id into its internal key', async () => {
    const item = await insertInventoryItem(dataSource);

    expect(await resolver.toInternalId(item.externalId)).toBe(item.id);
  });

  it('translates an internal key into the inventory item external id', async () => {
    const item = await insertInventoryItem(dataSource);

    expect(await resolver.toExternalId(item.id)).toBe(item.externalId);
  });

  it('answers null for a key that belongs to no inventory item, in both directions', async () => {
    expect(await resolver.toInternalId(randomUUID())).toBeNull();
    expect(await resolver.toExternalId(UNKNOWN_INTERNAL_ID)).toBeNull();
  });

  it('translates a batch of external ids and leaves the unknown ones out', async () => {
    const first = await insertInventoryItem(dataSource);
    const second = await insertInventoryItem(dataSource);

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
    const first = await insertInventoryItem(dataSource);
    const second = await insertInventoryItem(dataSource);

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

  it('resolves a deactivated inventory item in every form', async () => {
    const item = await insertInventoryItem(dataSource, { deactivated: true });

    expect(await resolver.toInternalId(item.externalId)).toBe(item.id);
    expect(await resolver.toExternalId(item.id)).toBe(item.externalId);
    expect(await resolver.toInternalIds([item.externalId])).toEqual(
      new Map([[item.externalId, item.id]]),
    );
    expect(await resolver.toExternalIds([item.id])).toEqual(new Map([[item.id, item.externalId]]));
  });

  // The fixture is written and read inside one transaction that is rolled back at the end: a
  // resolver that reads on its own connection cannot see the uncommitted row, and nothing is left
  // behind for a later test.
  it('resolves an inventory item inserted earlier in the same open transaction', async () => {
    const runner = new TypeOrmTransactionRunner(dataSource);
    const rollback = new Error('discard the fixture');
    let item!: InventoryItemKeys;
    let inside!: {
      internalId: string | null;
      externalId: string | null;
      internalIds: Map<string, string>;
      externalIds: Map<string, string>;
    };

    await expect(
      runner.run(async () => {
        item = await insertInventoryItem(currentEntityManager()!);
        inside = {
          internalId: await resolver.toInternalId(item.externalId),
          externalId: await resolver.toExternalId(item.id),
          internalIds: await resolver.toInternalIds([item.externalId]),
          externalIds: await resolver.toExternalIds([item.id]),
        };
        throw rollback;
      }),
    ).rejects.toThrow(rollback);

    expect(inside.internalId).toBe(item.id);
    expect(inside.externalId).toBe(item.externalId);
    expect(inside.internalIds).toEqual(new Map([[item.externalId, item.id]]));
    expect(inside.externalIds).toEqual(new Map([[item.id, item.externalId]]));
    expect(await resolver.toInternalId(item.externalId)).toBeNull();
  });
});
