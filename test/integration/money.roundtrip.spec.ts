import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { createTestDataSource } from '../support/db';
import { Money } from '../../src/shared/domain/value-objects/money';

// Money has no consumer column of its own in this feature's schema (it is shared kernel for
// features 3-8), so this proves spec.md's own Independent Test for IDENT-02 AC5 - a bigint
// column, read back as a string, converts to the same amount that was written - against a
// throwaway table that never touches a migration or the real schema.
let dataSource: DataSource;

beforeAll(async () => {
  dataSource = createTestDataSource();
  await dataSource.initialize();
  await dataSource.query(
    `CREATE TEMPORARY TABLE money_roundtrip_check (amount_cents bigint NOT NULL)`,
  );
});

afterEach(async () => {
  await dataSource.query(`TRUNCATE money_roundtrip_check`);
});

afterAll(async () => {
  await dataSource.destroy();
});

describe('Money round-trip through a real Postgres bigint column', () => {
  it('should read back the exact amount that was written', async () => {
    const written = Money.fromCents(15099);

    await dataSource.query(`INSERT INTO money_roundtrip_check (amount_cents) VALUES ($1)`, [
      written.cents,
    ]);
    const rows: Array<{ amount_cents: string }> = await dataSource.query(
      `SELECT amount_cents FROM money_roundtrip_check`,
    );

    expect(typeof rows[0].amount_cents).toBe('string');
    expect(Money.fromDatabase(rows[0].amount_cents).cents).toBe(written.cents);
  });

  it('should round-trip zero', async () => {
    await dataSource.query(`INSERT INTO money_roundtrip_check (amount_cents) VALUES ($1)`, [0]);
    const rows: Array<{ amount_cents: string }> = await dataSource.query(
      `SELECT amount_cents FROM money_roundtrip_check`,
    );

    expect(Money.fromDatabase(rows[0].amount_cents).cents).toBe(0);
  });
});
