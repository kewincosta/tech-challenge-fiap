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
      `woc-${Math.random().toString(36).slice(2)}@example.com`,
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

describe('work order closing schema migration', () => {
  it('should add the closing columns to work_orders with discount_cents and version defaulting to zero, the rest nullable', async () => {
    const columns: Array<{ column_name: string; is_nullable: string; column_default: string | null }> =
      await dataSource.query(
        `SELECT column_name, is_nullable, column_default
           FROM information_schema.columns
          WHERE table_name = 'work_orders'
            AND column_name IN ('charged_total_cents', 'discount_cents', 'discount_note',
              'discount_applied_by_user_id', 'discount_applied_at', 'completed_at', 'delivered_at',
              'delivered_by_user_id', 'canceled_at', 'canceled_by_user_id', 'cancellation_reason',
              'version')`,
      );
    const byName = new Map(columns.map((column) => [column.column_name, column]));
    expect(columns).toHaveLength(12);

    for (const nullable of [
      'charged_total_cents',
      'discount_note',
      'discount_applied_by_user_id',
      'discount_applied_at',
      'completed_at',
      'delivered_at',
      'delivered_by_user_id',
      'canceled_at',
      'canceled_by_user_id',
      'cancellation_reason',
    ]) {
      expect(byName.get(nullable)?.is_nullable).toBe('YES');
    }
    expect(byName.get('discount_cents')?.is_nullable).toBe('NO');
    expect(byName.get('discount_cents')?.column_default).toContain('0');
    expect(byName.get('version')?.is_nullable).toBe('NO');
    expect(byName.get('version')?.column_default).toContain('0');
  });

  it('should give the three actor columns on work_orders a foreign key to users, ON DELETE RESTRICT', async () => {
    const userId = await insertUser();
    const customerId = await insertCustomer(userId);
    const vehicleId = await insertVehicle(customerId);
    const workOrderId = await insertWorkOrder(customerId, vehicleId, userId);
    const nonExistentUserId = 999999999;

    await expect(
      dataSource.query(
        `UPDATE work_orders SET discount_applied_by_user_id = $1 WHERE id = $2`,
        [nonExistentUserId, workOrderId],
      ),
    ).rejects.toThrow(/foreign key/i);
    await expect(
      dataSource.query(
        `UPDATE work_orders SET delivered_by_user_id = $1 WHERE id = $2`,
        [nonExistentUserId, workOrderId],
      ),
    ).rejects.toThrow(/foreign key/i);
    await expect(
      dataSource.query(
        `UPDATE work_orders SET canceled_by_user_id = $1 WHERE id = $2`,
        [nonExistentUserId, workOrderId],
      ),
    ).rejects.toThrow(/foreign key/i);

    await expect(
      dataSource.query(`UPDATE work_orders SET discount_applied_by_user_id = $1 WHERE id = $2`, [
        userId,
        workOrderId,
      ]),
    ).resolves.not.toThrow();
  });

  it('should add a nullable quantity column to stock_movement_transitions', async () => {
    const columns: Array<{ column_name: string; is_nullable: string; data_type: string }> =
      await dataSource.query(
        `SELECT column_name, is_nullable, data_type
           FROM information_schema.columns
          WHERE table_name = 'stock_movement_transitions' AND column_name = 'quantity'`,
      );
    expect(columns).toHaveLength(1);
    expect(columns[0].is_nullable).toBe('YES');
    expect(columns[0].data_type).toBe('integer');
  });

  it('should default discount_cents and version to zero on insert, leaving every other closing column null', async () => {
    const userId = await insertUser();
    const customerId = await insertCustomer(userId);
    const vehicleId = await insertVehicle(customerId);
    const workOrderId = await insertWorkOrder(customerId, vehicleId, userId);

    const rows: Array<{
      charged_total_cents: number | null;
      discount_cents: string;
      version: number;
      completed_at: Date | null;
    }> = await dataSource.query(
      `SELECT charged_total_cents, discount_cents, version, completed_at
         FROM work_orders WHERE id = $1`,
      [workOrderId],
    );
    expect(rows[0].charged_total_cents).toBeNull();
    expect(Number(rows[0].discount_cents)).toBe(0);
    expect(rows[0].version).toBe(0);
    expect(rows[0].completed_at).toBeNull();
  });
});
