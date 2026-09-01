import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { createTestDataSource } from '../support/db';

let dataSource: DataSource;

beforeAll(async () => {
  dataSource = createTestDataSource();
  await dataSource.initialize();
});

afterAll(async () => {
  await dataSource.destroy();
});

async function insertUser(): Promise<number> {
  const rows: Array<{ id: number }> = await dataSource.query(
    `INSERT INTO users (external_id, email, password_hash, name, document, status, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, 'hash', 'Test User', $2, 'ACTIVE', now(), now())
     RETURNING id`,
    [
      `inv-${Math.random().toString(36).slice(2)}@example.com`,
      Math.random().toString().slice(2, 13),
    ],
  );
  return rows[0].id;
}

async function insertItem(overrides: {
  sku?: string;
  unitPriceCents?: number;
  quantityOnHand?: number;
  kind?: string;
  status?: string;
}): Promise<number> {
  const rows: Array<{ id: number }> = await dataSource.query(
    `INSERT INTO inventory_items (external_id, sku, name, kind, unit_price_cents, quantity_on_hand, status, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, 'Item de teste', $2, $3, $4, $5, now(), now())
     RETURNING id`,
    [
      overrides.sku ?? `SKU-${Math.random().toString(36).slice(2)}`,
      overrides.kind ?? 'PART',
      overrides.unitPriceCents ?? 1000,
      overrides.quantityOnHand ?? 0,
      overrides.status ?? 'ACTIVE',
    ],
  );
  return rows[0].id;
}

async function insertMovement(
  itemId: number,
  actorUserId: number,
  overrides: { quantity?: number; unitPriceCents?: number; kind?: string; status?: string | null },
): Promise<void> {
  await dataSource.query(
    `INSERT INTO stock_movements (external_id, inventory_item_id, kind, quantity, unit_price_cents, occurred_at, actor_user_id, status)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, now(), $5, $6)`,
    [
      itemId,
      overrides.kind ?? 'INBOUND',
      overrides.quantity ?? 1,
      overrides.unitPriceCents ?? 1000,
      actorUserId,
      overrides.status ?? null,
    ],
  );
}

describe('inventory schema migration', () => {
  it('should give all three tables a bigserial id and a unique external_id (AD-001)', async () => {
    for (const table of ['inventory_items', 'stock_movements', 'stock_movement_transitions']) {
      const columns: Array<{
        column_name: string;
        data_type: string;
        column_default: string | null;
        udt_name: string;
      }> = await dataSource.query(
        `SELECT column_name, data_type, column_default, udt_name
           FROM information_schema.columns
          WHERE table_name = $1 AND column_name IN ('id', 'external_id')`,
        [table],
      );
      const byName = Object.fromEntries(columns.map((c) => [c.column_name, c]));

      expect(byName.id.data_type).toBe('bigint');
      expect(byName.id.column_default).toContain('nextval(');
      expect(byName.external_id.udt_name).toBe('uuid');
    }
  });

  it('should reject a negative quantity_on_hand at the database level', async () => {
    await expect(insertItem({ quantityOnHand: -1 })).rejects.toThrow();
  });

  it('should reject a negative unit_price_cents on inventory_items at the database level', async () => {
    await expect(insertItem({ unitPriceCents: -1 })).rejects.toThrow();
  });

  it('should reject a negative unit_price_cents on stock_movements at the database level', async () => {
    const itemId = await insertItem({});
    const userId = await insertUser();

    await expect(insertMovement(itemId, userId, { unitPriceCents: -1 })).rejects.toThrow();
  });

  it('should reject a zero or negative quantity on stock_movements at the database level', async () => {
    const itemId = await insertItem({});
    const userId = await insertUser();

    await expect(insertMovement(itemId, userId, { quantity: 0 })).rejects.toThrow();
    await expect(insertMovement(itemId, userId, { quantity: -1 })).rejects.toThrow();
  });

  it('should enforce the kind and status CHECK constraints, including the consumption-era values', async () => {
    await expect(insertItem({ kind: 'BOGUS' })).rejects.toThrow();
    const itemId = await insertItem({});
    const userId = await insertUser();
    await expect(insertMovement(itemId, userId, { kind: 'BOGUS' })).rejects.toThrow();
    await expect(insertMovement(itemId, userId, { status: 'BOGUS' })).rejects.toThrow();
    // The values only features 5-7 will write must still be accepted today.
    await expect(insertMovement(itemId, userId, { kind: 'CONSUMPTION' })).resolves.not.toThrow();
    await expect(
      insertMovement(itemId, userId, { kind: 'CONSUMPTION', status: 'PENDING' }),
    ).resolves.not.toThrow();
  });

  it('should key ux_inventory_items_active_sku as a plain index on sku filtered by status', async () => {
    const indexDef: Array<{ indexdef: string }> = await dataSource.query(
      `SELECT indexdef FROM pg_indexes
        WHERE tablename = 'inventory_items' AND indexname = 'ux_inventory_items_active_sku'`,
    );

    expect(indexDef).toHaveLength(1);
    expect(indexDef[0].indexdef).toContain('(sku)');
    expect(indexDef[0].indexdef).not.toContain('lower(');
    expect(indexDef[0].indexdef).toContain("WHERE ((status)::text = 'ACTIVE'::text)");
  });

  it('should give stock_movements.actor_user_id a real foreign key to users(id)', async () => {
    const foreignKeys: Array<{ column_name: string; foreign_table_name: string }> =
      await dataSource.query(
        `SELECT kcu.column_name, ccu.table_name AS foreign_table_name
           FROM information_schema.table_constraints tc
           JOIN information_schema.key_column_usage kcu
             ON tc.constraint_name = kcu.constraint_name
           JOIN information_schema.constraint_column_usage ccu
             ON tc.constraint_name = ccu.constraint_name
          WHERE tc.table_name = 'stock_movements' AND tc.constraint_type = 'FOREIGN KEY'`,
      );

    const byColumn = Object.fromEntries(foreignKeys.map((fk) => [fk.column_name, fk]));
    expect(byColumn.actor_user_id.foreign_table_name).toBe('users');
  });

  // work_order_id was deliberately unconstrained when this migration ran, because work_orders
  // did not exist yet (this spec.md's own Out of Scope table). work-order-creation's own
  // migration adds fk_stock_movements_work_order once that table exists - proven in
  // work-orders-schema.migration.spec.ts, not re-asserted here to avoid the same fact owned by
  // two specs drifting apart.

  it('should index the read paths on stock_movements and stock_movement_transitions', async () => {
    const movementIndexes: Array<{ indexname: string }> = await dataSource.query(
      `SELECT indexname FROM pg_indexes
        WHERE tablename = 'stock_movements'
          AND indexname IN ('ix_stock_movements_item_occurred', 'ix_stock_movements_work_order_status')`,
    );
    const transitionIndexes: Array<{ indexname: string }> = await dataSource.query(
      `SELECT indexname FROM pg_indexes
        WHERE tablename = 'stock_movement_transitions' AND indexname = 'ix_stock_movement_transitions_movement'`,
    );

    expect(movementIndexes).toHaveLength(2);
    expect(transitionIndexes).toHaveLength(1);
  });
});
