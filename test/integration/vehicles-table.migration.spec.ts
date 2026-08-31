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

describe('vehicles table migration', () => {
  it('should give the table a bigserial internal id and a unique external_id (AD-001)', async () => {
    const columns: Array<{
      column_name: string;
      data_type: string;
      column_default: string | null;
      udt_name: string;
    }> = await dataSource.query(
      `SELECT column_name, data_type, column_default, udt_name
         FROM information_schema.columns
        WHERE table_name = 'vehicles' AND column_name IN ('id', 'external_id')`,
    );
    const byName = Object.fromEntries(columns.map((c) => [c.column_name, c]));

    expect(byName.id.data_type).toBe('bigint');
    expect(byName.id.column_default).toContain('nextval(');
    expect(byName.external_id.udt_name).toBe('uuid');
  });

  it('should require customer_id and reference customers(id)', async () => {
    const foreignKeys: Array<{ foreign_table_name: string }> = await dataSource.query(
      `SELECT ccu.table_name AS foreign_table_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name
         JOIN information_schema.constraint_column_usage ccu
           ON tc.constraint_name = ccu.constraint_name
        WHERE tc.table_name = 'vehicles' AND tc.constraint_type = 'FOREIGN KEY'
          AND kcu.column_name = 'customer_id'`,
    );
    expect(foreignKeys[0].foreign_table_name).toBe('customers');
  });

  it('should keep the plate unique only among active vehicles (partial index)', async () => {
    const indexDef: Array<{ indexdef: string }> = await dataSource.query(
      `SELECT indexdef FROM pg_indexes
        WHERE tablename = 'vehicles' AND indexname = 'ux_vehicles_plate'`,
    );
    expect(indexDef).toHaveLength(1);
    expect(indexDef[0].indexdef).toContain('WHERE (deleted_at IS NULL)');
  });

  it('should index customer_id for the list-by-customer query', async () => {
    const indexes: Array<{ indexname: string }> = await dataSource.query(
      `SELECT indexname FROM pg_indexes
        WHERE tablename = 'vehicles' AND indexname = 'ix_vehicles_customer_id'`,
    );
    expect(indexes).toHaveLength(1);
  });
});
