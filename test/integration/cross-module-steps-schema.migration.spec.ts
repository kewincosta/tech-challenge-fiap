import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { AddCrossModuleSteps1787702400009 } from '../../src/shared/infrastructure/database/migrations/1787702400009-add-cross-module-steps';
import { runMigrations } from '../support/global-setup';
import { createTestDataSource } from '../support/db';

let dataSource: DataSource;
// The steps a test inserts are due, and the test database is never truncated, so a processor that
// runs against it later would take them. Each test removes what it inserted.
const insertedOperations: string[] = [];

beforeAll(async () => {
  dataSource = createTestDataSource();
  await dataSource.initialize();
});

afterEach(async () => {
  const operationIds = insertedOperations.splice(0);
  await dataSource.query(
    `DELETE FROM work_order_stock_steps WHERE operation_id = ANY($1::uuid[])`,
    [operationIds],
  );
  await dataSource.query(
    `DELETE FROM customer_account_steps WHERE operation_id = ANY($1::uuid[])`,
    [operationIds],
  );
});

afterAll(async () => {
  await dataSource.destroy();
});

async function insertUser(): Promise<number> {
  const rows: Array<{ id: number }> = await dataSource.query(
    `INSERT INTO users (external_id, email, password_hash, name, document, status, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, 'hash', 'Test User', $2, 'ACTIVE', now(), now())
     RETURNING id`,
    [`cms-${randomUUID()}@example.com`, Math.random().toString().slice(2, 13)],
  );
  return rows[0].id;
}

async function insertWorkOrder(): Promise<number> {
  const userId = await insertUser();
  const customerRows: Array<{ id: number }> = await dataSource.query(
    `INSERT INTO customers (external_id, user_id, status, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, 'ACTIVE', now(), now())
     RETURNING id`,
    [userId],
  );
  const vehicleRows: Array<{ id: number }> = await dataSource.query(
    `INSERT INTO vehicles (external_id, customer_id, plate, brand, model, year, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, 'Toyota', 'Corolla', 2020, now(), now())
     RETURNING id`,
    [customerRows[0].id, Math.random().toString(36).slice(2, 9).toUpperCase()],
  );
  const rows: Array<{ id: number }> = await dataSource.query(
    `INSERT INTO work_orders (external_id, number, customer_id, vehicle_id, created_by_user_id, status, customer_name, vehicle_plate, vehicle_brand, vehicle_model, vehicle_year, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, 'IN_EXECUTION', 'Jane Doe', 'WO01234', 'Toyota', 'Corolla', 2020, now(), now())
     RETURNING id`,
    [
      `${Math.random().toString(36).slice(2, 8).toUpperCase()}-2026`,
      customerRows[0].id,
      vehicleRows[0].id,
      userId,
    ],
  );
  return rows[0].id;
}

function insertStockStep(
  workOrderId: number,
  overrides: { operationId?: string; status?: string } = {},
): Promise<unknown> {
  const operationId = overrides.operationId ?? randomUUID();
  insertedOperations.push(operationId);
  return dataSource.query(
    `INSERT INTO work_order_stock_steps (operation_id, kind, work_order_id, status, due_at, created_at)
     VALUES ($1, 'UNDO_CONSUMPTION', $2, $3, now(), now())`,
    [operationId, workOrderId, overrides.status ?? 'ARMED'],
  );
}

function insertAccountStep(
  overrides: { operationId?: string; status?: string } = {},
): Promise<unknown> {
  const operationId = overrides.operationId ?? randomUUID();
  insertedOperations.push(operationId);
  return dataSource.query(
    `INSERT INTO customer_account_steps (operation_id, kind, user_id, status, due_at, created_at)
     VALUES ($1, 'DISCARD_ACCOUNT', $2, $3, now(), now())`,
    [operationId, randomUUID(), overrides.status ?? 'ARMED'],
  );
}

interface ColumnRow {
  column_name: string;
  udt_name: string;
  is_nullable: string;
  column_default: string | null;
}

async function columnsOf(table: string): Promise<Map<string, ColumnRow>> {
  const columns: ColumnRow[] = await dataSource.query(
    `SELECT column_name, udt_name, is_nullable, column_default
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1`,
    [table],
  );
  return new Map(columns.map((column) => [column.column_name, column]));
}

function typeAndNullability(columns: Map<string, ColumnRow>): Record<string, string> {
  return Object.fromEntries(
    [...columns.values()].map((column) => [
      column.column_name,
      `${column.udt_name} ${column.is_nullable === 'YES' ? 'null' : 'not null'}`,
    ]),
  );
}

describe('cross-module steps schema migration', () => {
  it('should give work_order_stock_steps the columns of the outbox, the payload and the attempts defaulting to empty and zero', async () => {
    const columns = await columnsOf('work_order_stock_steps');

    expect(typeAndNullability(columns)).toEqual({
      id: 'int8 not null',
      operation_id: 'uuid not null',
      kind: 'varchar not null',
      work_order_id: 'int8 not null',
      payload: 'jsonb not null',
      status: 'varchar not null',
      attempts: 'int4 not null',
      due_at: 'timestamptz not null',
      last_error: 'text null',
      created_at: 'timestamptz not null',
      completed_at: 'timestamptz null',
    });
    expect(columns.get('payload')?.column_default).toContain('{}');
    expect(columns.get('attempts')?.column_default).toBe('0');
  });

  it('should give customer_account_steps the same columns, with a user id in place of the work order', async () => {
    const columns = await columnsOf('customer_account_steps');

    expect(typeAndNullability(columns)).toEqual({
      id: 'int8 not null',
      operation_id: 'uuid not null',
      kind: 'varchar not null',
      user_id: 'uuid not null',
      payload: 'jsonb not null',
      status: 'varchar not null',
      attempts: 'int4 not null',
      due_at: 'timestamptz not null',
      last_error: 'text null',
      created_at: 'timestamptz not null',
      completed_at: 'timestamptz null',
    });
    expect(columns.get('payload')?.column_default).toContain('{}');
    expect(columns.get('attempts')?.column_default).toBe('0');
  });

  it('should refuse a second work order step carrying an operation id already in use', async () => {
    const workOrderId = await insertWorkOrder();
    const operationId = randomUUID();
    await insertStockStep(workOrderId, { operationId });

    await expect(insertStockStep(workOrderId, { operationId })).rejects.toThrow(
      /ux_work_order_stock_steps_operation_id/,
    );
  });

  it('should refuse a second account step carrying an operation id already in use', async () => {
    const operationId = randomUUID();
    await insertAccountStep({ operationId });

    await expect(insertAccountStep({ operationId })).rejects.toThrow(
      /ux_customer_account_steps_operation_id/,
    );
  });

  it('should refuse a work order step status outside ARMED, PENDING, DONE and FAILED, and accept each of those', async () => {
    const workOrderId = await insertWorkOrder();

    await expect(insertStockStep(workOrderId, { status: 'RUNNING' })).rejects.toThrow(
      /chk_work_order_stock_steps_status/,
    );
    for (const status of ['ARMED', 'PENDING', 'DONE', 'FAILED']) {
      await expect(insertStockStep(workOrderId, { status })).resolves.not.toThrow();
    }
  });

  it('should refuse an account step status outside ARMED, PENDING, DONE and FAILED, and accept each of those', async () => {
    await expect(insertAccountStep({ status: 'RUNNING' })).rejects.toThrow(
      /chk_customer_account_steps_status/,
    );
    for (const status of ['ARMED', 'PENDING', 'DONE', 'FAILED']) {
      await expect(insertAccountStep({ status })).resolves.not.toThrow();
    }
  });

  it('should refuse a work order step for a work order that does not exist', async () => {
    await expect(insertStockStep(999999999)).rejects.toThrow(/foreign key/i);
  });

  it('should add a nullable uuid operation_id to stock_movements and index it', async () => {
    const columns = await columnsOf('stock_movements');
    const indexes: Array<{ indexdef: string }> = await dataSource.query(
      `SELECT indexdef FROM pg_indexes
        WHERE tablename = 'stock_movements' AND indexname = 'ix_stock_movements_operation_id'`,
    );

    expect(columns.get('operation_id')).toMatchObject({ udt_name: 'uuid', is_nullable: 'YES' });
    expect(indexes).toHaveLength(1);
    expect(indexes[0].indexdef).toContain('(operation_id)');
  });
});

describe('cross-module steps schema migration, reverted', () => {
  // The migration is reverted on a database of its own, so the shared test database keeps the
  // schema every other spec relies on. The suffix keeps the global setup's guard satisfied.
  const SCRATCH_DATABASE = `workshop_steps_${randomUUID().replaceAll('-', '').slice(0, 16)}_test`;

  function createMaintenanceDataSource(): DataSource {
    return new DataSource({
      type: 'postgres',
      host: process.env.DATABASE_HOST,
      port: Number(process.env.DATABASE_PORT),
      username: process.env.DATABASE_USER,
      password: process.env.DATABASE_PASSWORD,
      database: 'postgres',
    });
  }

  async function runOnMaintenanceDatabase(statement: string): Promise<void> {
    const maintenance = createMaintenanceDataSource();
    await maintenance.initialize();
    try {
      await maintenance.query(statement);
    } finally {
      await maintenance.destroy();
    }
  }

  beforeAll(async () => {
    await runOnMaintenanceDatabase(`CREATE DATABASE "${SCRATCH_DATABASE}"`);
    await runMigrations(SCRATCH_DATABASE);
  });

  afterAll(async () => {
    await runOnMaintenanceDatabase(`DROP DATABASE IF EXISTS "${SCRATCH_DATABASE}" WITH (FORCE)`);
  });

  it('should remove both step tables, the operation_id column of stock_movements and its index', async () => {
    const scratch = new DataSource({
      type: 'postgres',
      host: process.env.DATABASE_HOST,
      port: Number(process.env.DATABASE_PORT),
      username: process.env.DATABASE_USER,
      password: process.env.DATABASE_PASSWORD,
      database: SCRATCH_DATABASE,
      migrations: [AddCrossModuleSteps1787702400009],
    });
    await scratch.initialize();
    try {
      await scratch.undoLastMigration();

      const tables: Array<{ table_name: string }> = await scratch.query(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name IN ('work_order_stock_steps', 'customer_account_steps')`,
      );
      const columns: Array<{ column_name: string }> = await scratch.query(
        `SELECT column_name FROM information_schema.columns
          WHERE table_name = 'stock_movements' AND column_name = 'operation_id'`,
      );
      const indexes: Array<{ indexname: string }> = await scratch.query(
        `SELECT indexname FROM pg_indexes WHERE indexname = 'ix_stock_movements_operation_id'`,
      );

      expect({ tables, columns, indexes }).toEqual({ tables: [], columns: [], indexes: [] });
    } finally {
      await scratch.destroy();
    }
  });
});
