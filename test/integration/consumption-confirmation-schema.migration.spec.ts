import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { StockMovementOrmEntity } from '../../src/modules/inventory/infrastructure/persistence/stock-movement.orm-entity';
import { AddConsumptionConfirmation1787702400010 } from '../../src/shared/infrastructure/database/migrations/1787702400010-add-consumption-confirmation';
import { createTestDataSource } from '../support/db';
import { runMigrations } from '../support/global-setup';

describe('consumption confirmation schema migration', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = createTestDataSource();
    await dataSource.initialize();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('should add a nullable timestamptz confirmed_at to stock_movements, with no default', async () => {
    const columns: Array<{
      udt_name: string;
      is_nullable: string;
      column_default: string | null;
    }> = await dataSource.query(
      `SELECT udt_name, is_nullable, column_default
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'stock_movements'
          AND column_name = 'confirmed_at'`,
    );

    expect(columns).toEqual([
      { udt_name: 'timestamptz', is_nullable: 'YES', column_default: null },
    ]);
  });
});

// The migration is applied, reverted and applied again on a database of its own, so the shared test
// database keeps the schema every other spec relies on and the rows these cases insert go away with
// the database. The suffix keeps the global setup's guard satisfied.
describe('consumption confirmation schema migration, on a database of its own', () => {
  const SCRATCH_DATABASE = `workshop_confirm_${randomUUID().replaceAll('-', '').slice(0, 16)}_test`;
  let scratch: DataSource;

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
    scratch = new DataSource({
      type: 'postgres',
      host: process.env.DATABASE_HOST,
      port: Number(process.env.DATABASE_PORT),
      username: process.env.DATABASE_USER,
      password: process.env.DATABASE_PASSWORD,
      database: SCRATCH_DATABASE,
      entities: [StockMovementOrmEntity],
      migrations: [AddConsumptionConfirmation1787702400010],
    });
    await scratch.initialize();
  });

  afterAll(async () => {
    await scratch.destroy();
    await runOnMaintenanceDatabase(`DROP DATABASE IF EXISTS "${SCRATCH_DATABASE}" WITH (FORCE)`);
  });

  // Every case starts with the migration applied, whichever state the case before it left.
  beforeEach(async () => {
    await scratch.runMigrations();
  });

  async function insertItemWithActor(): Promise<{ itemId: string; actorId: string }> {
    const users: Array<{ id: string }> = await scratch.query(
      `INSERT INTO users (external_id, email, password_hash, name, document, status, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, 'hash', 'Test User', $2, 'ACTIVE', now(), now())
       RETURNING id`,
      [`confirm-${randomUUID()}@example.com`, Math.random().toString().slice(2, 13)],
    );
    const items: Array<{ id: string }> = await scratch.query(
      `INSERT INTO inventory_items (external_id, sku, name, kind, unit_price_cents, quantity_on_hand, status, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, 'Item de teste', 'PART', 1000, 10, 'ACTIVE', now(), now())
       RETURNING id`,
      [`SKU-${randomUUID()}`],
    );
    return { itemId: items[0].id, actorId: users[0].id };
  }

  interface MovementFixture {
    kind: 'INBOUND' | 'CONSUMPTION' | 'RETURN' | 'ADJUSTMENT';
    status?: 'PENDING' | 'SETTLED' | 'WRITTEN_OFF';
    operationId?: string;
    occurredAt: Date;
  }

  // The column list names no `confirmed_at`, so the same statement runs before and after the
  // migration, as the code that wrote movements before it did.
  async function insertMovement(
    fixture: { itemId: string; actorId: string },
    movement: MovementFixture,
  ): Promise<void> {
    await scratch.query(
      `INSERT INTO stock_movements
         (external_id, inventory_item_id, kind, quantity, unit_price_cents, status, occurred_at, actor_user_id, operation_id)
       VALUES (gen_random_uuid(), $1, $2, 1, 1000, $3, $4, $5, $6)`,
      [
        fixture.itemId,
        movement.kind,
        movement.status ?? null,
        movement.occurredAt,
        fixture.actorId,
        movement.operationId ?? null,
      ],
    );
  }

  async function columnNamed(name: string): Promise<unknown[]> {
    return scratch.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'stock_movements' AND column_name = $1`,
      [name],
    );
  }

  it('should set confirmed_at to occurred_at on every consumption recorded before it, whatever its status or operation, and leave the other movements empty', async () => {
    await scratch.undoLastMigration();
    const fixture = await insertItemWithActor();
    const at = (minute: number) => new Date(Date.UTC(2026, 0, 1, 12, minute));
    const recorded: Array<[string, MovementFixture]> = [
      [
        'pending with an operation',
        {
          kind: 'CONSUMPTION',
          status: 'PENDING',
          operationId: randomUUID(),
          occurredAt: at(1),
        },
      ],
      ['pending with no operation', { kind: 'CONSUMPTION', status: 'PENDING', occurredAt: at(2) }],
      ['settled', { kind: 'CONSUMPTION', status: 'SETTLED', occurredAt: at(3) }],
      ['written off', { kind: 'CONSUMPTION', status: 'WRITTEN_OFF', occurredAt: at(4) }],
      ['inbound', { kind: 'INBOUND', occurredAt: at(5) }],
      ['return', { kind: 'RETURN', operationId: randomUUID(), occurredAt: at(6) }],
      ['adjustment', { kind: 'ADJUSTMENT', occurredAt: at(7) }],
    ];
    for (const [, movement] of recorded) {
      await insertMovement(fixture, movement);
    }

    await scratch.runMigrations();

    // Read through the entity, which also proves that it maps the column.
    const rows = await scratch.getRepository(StockMovementOrmEntity).find({
      where: { inventoryItemInternalId: fixture.itemId },
      order: { occurredAt: 'ASC' },
    });
    expect(rows.map((row) => [row.kind, row.occurredAt, row.confirmedAt])).toEqual([
      ['CONSUMPTION', at(1), at(1)],
      ['CONSUMPTION', at(2), at(2)],
      ['CONSUMPTION', at(3), at(3)],
      ['CONSUMPTION', at(4), at(4)],
      ['INBOUND', at(5), null],
      ['RETURN', at(6), null],
      ['ADJUSTMENT', at(7), null],
    ]);
  });

  it('should leave a consumption written after the migration without a confirmation time', async () => {
    const fixture = await insertItemWithActor();
    const repository = scratch.getRepository(StockMovementOrmEntity);
    const externalId = randomUUID();

    await repository.save(
      repository.create({
        externalId,
        inventoryItemInternalId: fixture.itemId,
        kind: 'CONSUMPTION',
        quantity: 2,
        unitPriceCents: '1000',
        status: 'PENDING',
        occurredAt: new Date(),
        actorInternalId: fixture.actorId,
        operationId: randomUUID(),
      }),
    );

    const rows: Array<{ confirmed_at: Date | null }> = await scratch.query(
      `SELECT confirmed_at FROM stock_movements WHERE external_id = $1`,
      [externalId],
    );
    expect(rows).toEqual([{ confirmed_at: null }]);
    expect((await repository.findOneByOrFail({ externalId })).confirmedAt).toBeNull();
  });

  it('should remove the column on revert and keep the movements', async () => {
    const fixture = await insertItemWithActor();
    await insertMovement(fixture, {
      kind: 'CONSUMPTION',
      status: 'PENDING',
      operationId: randomUUID(),
      occurredAt: new Date(),
    });
    const before: Array<{ count: string }> = await scratch.query(
      `SELECT count(*) AS count FROM stock_movements`,
    );
    expect(await columnNamed('confirmed_at')).toHaveLength(1);

    await scratch.undoLastMigration();

    expect(await columnNamed('confirmed_at')).toEqual([]);
    expect(await scratch.query(`SELECT count(*) AS count FROM stock_movements`)).toEqual(before);
  });
});
