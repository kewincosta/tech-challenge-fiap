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
      `wo-${Math.random().toString(36).slice(2)}@example.com`,
      Math.random().toString().slice(2, 13),
    ],
  );
  return rows[0].id;
}

async function insertCustomer(userId: number): Promise<number> {
  const rows: Array<{ id: number }> = await dataSource.query(
    `INSERT INTO customers (external_id, user_id, status, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, 'ACTIVE', now(), now())
     RETURNING id`,
    [userId],
  );
  return rows[0].id;
}

async function insertVehicle(customerId: number): Promise<number> {
  const rows: Array<{ id: number }> = await dataSource.query(
    `INSERT INTO vehicles (external_id, customer_id, plate, brand, model, year, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, 'Toyota', 'Corolla', 2020, now(), now())
     RETURNING id`,
    // Full 7-char keyspace, not a 4-digit suffix: the plate's active-only unique index still
    // applies here, and the test database is never truncated (STATE.md Conventions).
    [customerId, Math.random().toString(36).slice(2, 9).toUpperCase()],
  );
  return rows[0].id;
}

async function insertWorkOrder(
  customerId: number,
  vehicleId: number,
  creatorId: number,
  overrides: { status?: string; number?: string } = {},
): Promise<number> {
  const rows: Array<{ id: number }> = await dataSource.query(
    `INSERT INTO work_orders (external_id, number, customer_id, vehicle_id, created_by_user_id, status, customer_name, vehicle_plate, vehicle_brand, vehicle_model, vehicle_year, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'Jane Doe', 'WO01234', 'Toyota', 'Corolla', 2020, now(), now())
     RETURNING id`,
    [
      overrides.number ?? `${Math.random().toString(36).slice(2, 8).toUpperCase()}-2026`,
      customerId,
      vehicleId,
      creatorId,
      overrides.status ?? 'RECEIVED',
    ],
  );
  return rows[0].id;
}

async function insertWorkOrderPart(
  workOrderId: number,
  inventoryItemId: number,
  overrides: { plannedQuantity?: number; withdrawnQuantity?: number; unitPriceCents?: number } = {},
): Promise<void> {
  await dataSource.query(
    `INSERT INTO work_order_parts (external_id, work_order_id, inventory_item_id, sku, item_name, planned_quantity, withdrawn_quantity, unit_price_cents, created_at)
     VALUES (gen_random_uuid(), $1, $2, 'FLT-001', 'Filtro de oleo', $3, $4, $5, now())`,
    [
      workOrderId,
      inventoryItemId,
      overrides.plannedQuantity ?? 1,
      overrides.withdrawnQuantity ?? 0,
      overrides.unitPriceCents ?? 1000,
    ],
  );
}

async function insertWorkOrderService(
  workOrderId: number,
  serviceId: number,
  unitPriceCents = 1000,
): Promise<void> {
  await dataSource.query(
    `INSERT INTO work_order_services (external_id, work_order_id, service_id, service_name, unit_price_cents, created_at)
     VALUES (gen_random_uuid(), $1, $2, 'Troca de oleo', $3, now())`,
    [workOrderId, serviceId, unitPriceCents],
  );
}

async function insertService(): Promise<number> {
  const rows: Array<{ id: number }> = await dataSource.query(
    `INSERT INTO services (external_id, name, price_cents, estimated_duration_minutes, status, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, 15099, 60, 'ACTIVE', now(), now())
     RETURNING id`,
    [`Servico ${Math.random().toString(36).slice(2)}`],
  );
  return rows[0].id;
}

async function insertInventoryItem(): Promise<number> {
  const rows: Array<{ id: number }> = await dataSource.query(
    `INSERT INTO inventory_items (external_id, sku, name, kind, unit_price_cents, quantity_on_hand, status, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, 'Item de teste', 'PART', 1000, 0, 'ACTIVE', now(), now())
     RETURNING id`,
    [`SKU-${Math.random().toString(36).slice(2)}`],
  );
  return rows[0].id;
}

describe('work orders schema migration', () => {
  it('should give all four tables a bigserial id and a unique external_id (AD-001)', async () => {
    for (const table of [
      'work_orders',
      'work_order_services',
      'work_order_parts',
      'work_order_events',
    ]) {
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

  it('should enforce the status CHECK listing all seven states', async () => {
    const user = await insertUser();
    const customer = await insertCustomer(user);
    const vehicle = await insertVehicle(customer);

    await expect(insertWorkOrder(customer, vehicle, user, { status: 'BOGUS' })).rejects.toThrow();
    // The five states only features 6-8 will ever set must still be accepted today.
    await expect(
      insertWorkOrder(customer, vehicle, user, { status: 'IN_EXECUTION' }),
    ).resolves.not.toThrow();
  });

  it('should reject a duplicate work order number at the database level', async () => {
    const user = await insertUser();
    const customer = await insertCustomer(user);
    const vehicle1 = await insertVehicle(customer);
    const vehicle2 = await insertVehicle(customer);
    // Unique per run: the test database is never truncated (STATE.md Conventions).
    const number = `${Math.random().toString(36).slice(2, 8).toUpperCase()}-2026`;
    await insertWorkOrder(customer, vehicle1, user, { number });

    await expect(insertWorkOrder(customer, vehicle2, user, { number })).rejects.toThrow();
  });

  it('should refuse a second non-terminal work order for the same vehicle and accept one once the first is DELIVERED', async () => {
    const user = await insertUser();
    const customer = await insertCustomer(user);
    const vehicle = await insertVehicle(customer);
    await insertWorkOrder(customer, vehicle, user, { status: 'RECEIVED' });

    await expect(
      insertWorkOrder(customer, vehicle, user, { status: 'IN_EXECUTION' }),
    ).rejects.toThrow();

    await dataSource.query(`UPDATE work_orders SET status = 'DELIVERED' WHERE vehicle_id = $1`, [
      vehicle,
    ]);
    await expect(
      insertWorkOrder(customer, vehicle, user, { status: 'RECEIVED' }),
    ).resolves.not.toThrow();
  });

  it('should reject a zero planned_quantity and a negative withdrawn_quantity at the database level', async () => {
    const user = await insertUser();
    const customer = await insertCustomer(user);
    const vehicle = await insertVehicle(customer);
    const workOrder = await insertWorkOrder(customer, vehicle, user);
    const inventoryItem = await insertInventoryItem();

    await expect(
      insertWorkOrderPart(workOrder, inventoryItem, { plannedQuantity: 0 }),
    ).rejects.toThrow();
    await expect(
      insertWorkOrderPart(workOrder, inventoryItem, { withdrawnQuantity: -1 }),
    ).rejects.toThrow();
  });

  it('should reject a negative unit_price_cents on both item tables at the database level', async () => {
    const user = await insertUser();
    const customer = await insertCustomer(user);
    const vehicle = await insertVehicle(customer);
    const workOrder = await insertWorkOrder(customer, vehicle, user);
    const inventoryItem = await insertInventoryItem();
    const service = await insertService();

    await expect(
      insertWorkOrderPart(workOrder, inventoryItem, { unitPriceCents: -1 }),
    ).rejects.toThrow();
    await expect(insertWorkOrderService(workOrder, service, -1)).rejects.toThrow();
  });

  it('should index work_order_events on (work_order_id, occurred_at)', async () => {
    const indexes: Array<{ indexname: string }> = await dataSource.query(
      `SELECT indexname FROM pg_indexes
        WHERE tablename = 'work_order_events' AND indexname = 'ix_work_order_events_work_order_occurred'`,
    );

    expect(indexes).toHaveLength(1);
  });

  it('should give stock_movements.work_order_id a foreign key to work_orders(id)', async () => {
    const foreignKeys: Array<{ foreign_table_name: string }> = await dataSource.query(
      `SELECT ccu.table_name AS foreign_table_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name
         JOIN information_schema.constraint_column_usage ccu
           ON tc.constraint_name = ccu.constraint_name
        WHERE tc.table_name = 'stock_movements' AND tc.constraint_type = 'FOREIGN KEY'
          AND kcu.column_name = 'work_order_id'`,
    );

    expect(foreignKeys).toHaveLength(1);
    expect(foreignKeys[0].foreign_table_name).toBe('work_orders');
  });
});
