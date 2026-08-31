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

describe('customers table migration', () => {
  it('should give the table a bigserial internal id and a unique external_id (AD-001)', async () => {
    const columns: Array<{
      column_name: string;
      data_type: string;
      column_default: string | null;
      is_nullable: string;
      udt_name: string;
    }> = await dataSource.query(
      `SELECT column_name, data_type, column_default, is_nullable, udt_name
         FROM information_schema.columns
        WHERE table_name = 'customers' AND column_name IN ('id', 'external_id')`,
    );
    const byName = Object.fromEntries(columns.map((c) => [c.column_name, c]));

    expect(byName.id.data_type).toBe('bigint');
    expect(byName.id.column_default).toContain('nextval(');
    expect(byName.external_id.udt_name).toBe('uuid');
    expect(byName.external_id.is_nullable).toBe('NO');
  });

  it('should require user_id and reference users(id)', async () => {
    const columns: Array<{ column_name: string; data_type: string; is_nullable: string }> =
      await dataSource.query(
        `SELECT column_name, data_type, is_nullable
           FROM information_schema.columns
          WHERE table_name = 'customers' AND column_name = 'user_id'`,
      );
    expect(columns[0].data_type).toBe('bigint');
    expect(columns[0].is_nullable).toBe('NO');

    const foreignKeys: Array<{ foreign_table_name: string }> = await dataSource.query(
      `SELECT ccu.table_name AS foreign_table_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name
         JOIN information_schema.constraint_column_usage ccu
           ON tc.constraint_name = ccu.constraint_name
        WHERE tc.table_name = 'customers' AND tc.constraint_type = 'FOREIGN KEY'
          AND kcu.column_name = 'user_id'`,
    );
    expect(foreignKeys[0].foreign_table_name).toBe('users');
  });

  it('should keep user_id unique with no deleted_at filter (a user backs at most one customer, ever)', async () => {
    const indexDef: Array<{ indexdef: string }> = await dataSource.query(
      `SELECT indexdef FROM pg_indexes
        WHERE tablename = 'customers' AND indexname = 'ux_customers_user_id'`,
    );
    expect(indexDef).toHaveLength(1);
    expect(indexDef[0].indexdef).not.toContain('WHERE');
  });

  it('should leave every address column and phone nullable', async () => {
    const columns: Array<{ column_name: string; is_nullable: string }> = await dataSource.query(
      `SELECT column_name, is_nullable
         FROM information_schema.columns
        WHERE table_name = 'customers'
          AND column_name IN ('address_street', 'address_number', 'address_complement',
                               'address_district', 'address_city', 'address_state',
                               'address_zip_code', 'phone')`,
    );
    expect(columns).toHaveLength(8);
    for (const column of columns) {
      expect(column.is_nullable).toBe('YES');
    }
  });

  it('should reject a status outside ACTIVE/INACTIVE at the database level', async () => {
    await expect(
      dataSource.query(
        `INSERT INTO customers (external_id, user_id, status, created_at, updated_at)
         VALUES (gen_random_uuid(), 1, 'BOGUS', now(), now())`,
      ),
    ).rejects.toThrow();
  });
});
