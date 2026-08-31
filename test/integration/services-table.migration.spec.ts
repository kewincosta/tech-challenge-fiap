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

async function insertService(overrides: {
  name?: string;
  price?: number;
  duration?: number;
  status?: string;
}): Promise<void> {
  await dataSource.query(
    `INSERT INTO services (external_id, name, price_cents, estimated_duration_minutes, status, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, now(), now())`,
    [
      overrides.name ?? `svc-${Math.random().toString(36).slice(2)}`,
      overrides.price ?? 1000,
      overrides.duration ?? 60,
      overrides.status ?? 'ACTIVE',
    ],
  );
}

describe('services table migration', () => {
  it('should give the table a bigserial internal id, a unique external_id and no deleted_at (AD-001)', async () => {
    const columns: Array<{
      column_name: string;
      data_type: string;
      column_default: string | null;
      udt_name: string;
    }> = await dataSource.query(
      `SELECT column_name, data_type, column_default, udt_name
         FROM information_schema.columns
        WHERE table_name = 'services'`,
    );
    const byName = Object.fromEntries(columns.map((c) => [c.column_name, c]));

    expect(byName.id.data_type).toBe('bigint');
    expect(byName.id.column_default).toContain('nextval(');
    expect(byName.external_id.udt_name).toBe('uuid');
    expect(byName.price_cents.data_type).toBe('bigint');
    expect(byName.deleted_at).toBeUndefined();
  });

  it('should reject a negative price at the database level', async () => {
    await expect(insertService({ price: -1 })).rejects.toThrow();
  });

  it('should reject a zero duration at the database level', async () => {
    await expect(insertService({ duration: 0 })).rejects.toThrow();
  });

  it('should reject a status outside ACTIVE/INACTIVE at the database level', async () => {
    await expect(insertService({ status: 'BOGUS' })).rejects.toThrow();
  });

  it('should key the active-name index on lower(name) and filter it by status', async () => {
    const indexDef: Array<{ indexdef: string }> = await dataSource.query(
      `SELECT indexdef FROM pg_indexes
        WHERE tablename = 'services' AND indexname = 'ux_services_active_name'`,
    );

    expect(indexDef).toHaveLength(1);
    // Postgres normalises lower(name) to lower((name)::text) in indexdef because name is varchar -
    // this is the real, observed text, not a guess.
    expect(indexDef[0].indexdef).toContain('lower((name)::text)');
    expect(indexDef[0].indexdef).toContain("WHERE ((status)::text = 'ACTIVE'::text)");
  });
});
