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
      `wob-${Math.random().toString(36).slice(2)}@example.com`,
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
    [customerId, Math.random().toString(36).slice(2, 9).toUpperCase()],
  );
  return rows[0].id;
}

async function insertWorkOrder(customerId: number, vehicleId: number, creatorId: number): Promise<number> {
  const rows: Array<{ id: number }> = await dataSource.query(
    `INSERT INTO work_orders (external_id, number, customer_id, vehicle_id, created_by_user_id, status, customer_name, vehicle_plate, vehicle_brand, vehicle_model, vehicle_year, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, 'RECEIVED', 'Jane Doe', 'WO01234', 'Toyota', 'Corolla', 2020, now(), now())
     RETURNING id`,
    [`${Math.random().toString(36).slice(2, 8).toUpperCase()}-2026`, customerId, vehicleId, creatorId],
  );
  return rows[0].id;
}

async function insertBudget(
  workOrderId: number,
  round: number,
  overrides: { status?: string; totalCents?: number } = {},
): Promise<void> {
  await dataSource.query(
    `INSERT INTO work_order_budgets (external_id, work_order_id, round, total_cents, status, generated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, now())`,
    [workOrderId, round, overrides.totalCents ?? 20099, overrides.status ?? 'PENDING'],
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

describe('work order budgets schema migration', () => {
  it('should give work_order_budgets a bigserial id, a unique external_id and the CHECK on status', async () => {
    const columns: Array<{ column_name: string; data_type: string; udt_name: string }> =
      await dataSource.query(
        `SELECT column_name, data_type, udt_name
           FROM information_schema.columns
          WHERE table_name = 'work_order_budgets'
            AND column_name IN ('id', 'external_id', 'round', 'total_cents', 'status', 'generated_at', 'decided_at', 'decided_by_user_id')`,
      );
    const byName = new Map(columns.map((column) => [column.column_name, column]));
    expect(byName.get('id')?.data_type).toBe('bigint');
    expect(byName.get('external_id')?.udt_name).toBe('uuid');
    expect(byName.get('round')?.data_type).toBe('integer');
    expect(byName.get('total_cents')?.data_type).toBe('bigint');
    expect(byName.get('status')?.udt_name).toBe('varchar');
    expect(byName.get('generated_at')?.udt_name).toBe('timestamptz');
    expect(byName.get('decided_at')?.udt_name).toBe('timestamptz');
    expect(byName.get('decided_by_user_id')?.data_type).toBe('bigint');
  });

  it('should reject a status outside PENDING, APPROVED, REJECTED', async () => {
    const userId = await insertUser();
    const customerId = await insertCustomer(userId);
    const vehicleId = await insertVehicle(customerId);
    const workOrderId = await insertWorkOrder(customerId, vehicleId, userId);

    await expect(insertBudget(workOrderId, 1, { status: 'DRAFT' })).rejects.toThrow(/chk_work_order_budgets_status/);
  });

  it('should refuse a second round carrying the same number on one work order', async () => {
    const userId = await insertUser();
    const customerId = await insertCustomer(userId);
    const vehicleId = await insertVehicle(customerId);
    const workOrderId = await insertWorkOrder(customerId, vehicleId, userId);
    await insertBudget(workOrderId, 1);

    await expect(insertBudget(workOrderId, 1)).rejects.toThrow(/ux_work_order_budgets_round/);
  });

  it('should accept a second round with a different number on the same work order', async () => {
    const userId = await insertUser();
    const customerId = await insertCustomer(userId);
    const vehicleId = await insertVehicle(customerId);
    const workOrderId = await insertWorkOrder(customerId, vehicleId, userId);
    await insertBudget(workOrderId, 1);

    await expect(insertBudget(workOrderId, 2)).resolves.not.toThrow();
  });

  it('should add five nullable columns to work_orders, every existing row unaffected', async () => {
    const columns: Array<{ column_name: string; is_nullable: string }> = await dataSource.query(
      `SELECT column_name, is_nullable
         FROM information_schema.columns
        WHERE table_name = 'work_orders'
          AND column_name IN ('diagnosis_started_at', 'diagnosis_completed_at', 'budget_decided_at', 'budget_decided_by_user_id', 'execution_started_at')`,
    );
    expect(columns).toHaveLength(5);
    expect(columns.every((column) => column.is_nullable === 'YES')).toBe(true);
  });

  it('should give work_order_services and work_order_parts a nullable budget_id and budgeted_unit_price_cents', async () => {
    for (const table of ['work_order_services', 'work_order_parts']) {
      const columns: Array<{ column_name: string; is_nullable: string; data_type: string }> =
        await dataSource.query(
          `SELECT column_name, is_nullable, data_type
             FROM information_schema.columns
            WHERE table_name = $1
              AND column_name IN ('budget_id', 'budgeted_unit_price_cents')`,
          [table],
        );
      expect(columns).toHaveLength(2);
      expect(columns.every((column) => column.is_nullable === 'YES')).toBe(true);
      const byName = new Map(columns.map((column) => [column.column_name, column]));
      expect(byName.get('budget_id')?.data_type).toBe('bigint');
      expect(byName.get('budgeted_unit_price_cents')?.data_type).toBe('bigint');
    }
  });

  it('should persist a budget_id and a budgeted_unit_price_cents on a service item', async () => {
    const userId = await insertUser();
    const customerId = await insertCustomer(userId);
    const vehicleId = await insertVehicle(customerId);
    const workOrderId = await insertWorkOrder(customerId, vehicleId, userId);
    const serviceId = await insertService();
    const rows: Array<{ id: number }> = await dataSource.query(
      `INSERT INTO work_order_budgets (external_id, work_order_id, round, total_cents, status, generated_at)
       VALUES (gen_random_uuid(), $1, 1, 15099, 'PENDING', now())
       RETURNING id`,
      [workOrderId],
    );
    const budgetId = rows[0].id;

    await dataSource.query(
      `INSERT INTO work_order_services (external_id, work_order_id, service_id, service_name, unit_price_cents, created_at, budget_id, budgeted_unit_price_cents)
       VALUES (gen_random_uuid(), $1, $2, 'Troca de oleo', 15099, now(), $3, 15099)`,
      [workOrderId, serviceId, budgetId],
    );

    const persisted: Array<{ budget_id: string; budgeted_unit_price_cents: string }> =
      await dataSource.query(
        `SELECT budget_id, budgeted_unit_price_cents FROM work_order_services WHERE work_order_id = $1`,
        [workOrderId],
      );
    expect(Number(persisted[0].budget_id)).toBe(Number(budgetId));
    expect(Number(persisted[0].budgeted_unit_price_cents)).toBe(15099);
  });

  it('should leave a draft part item with budget_id and budgeted_unit_price_cents null', async () => {
    const userId = await insertUser();
    const customerId = await insertCustomer(userId);
    const vehicleId = await insertVehicle(customerId);
    const workOrderId = await insertWorkOrder(customerId, vehicleId, userId);
    const inventoryItemId = await insertInventoryItem();

    await dataSource.query(
      `INSERT INTO work_order_parts (external_id, work_order_id, inventory_item_id, sku, item_name, planned_quantity, withdrawn_quantity, unit_price_cents, created_at)
       VALUES (gen_random_uuid(), $1, $2, 'FLT-001', 'Filtro de oleo', 2, 0, 2500, now())`,
      [workOrderId, inventoryItemId],
    );

    const persisted: Array<{ budget_id: string | null; budgeted_unit_price_cents: string | null }> =
      await dataSource.query(
        `SELECT budget_id, budgeted_unit_price_cents FROM work_order_parts WHERE work_order_id = $1`,
        [workOrderId],
      );
    expect(persisted[0].budget_id).toBeNull();
    expect(persisted[0].budgeted_unit_price_cents).toBeNull();
  });
});
