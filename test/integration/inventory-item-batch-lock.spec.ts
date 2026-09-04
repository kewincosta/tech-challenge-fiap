import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { Money } from '../../src/shared/domain/value-objects/money';
import { InventoryItem } from '../../src/modules/inventory/domain/entities/inventory-item';
import { InsufficientStockError } from '../../src/modules/inventory/domain/errors/insufficient-stock.error';
import { InventoryItemKind } from '../../src/modules/inventory/domain/inventory-item-kind';
import { InventoryItemId } from '../../src/modules/inventory/domain/value-objects/inventory-item-id';
import { Sku } from '../../src/modules/inventory/domain/value-objects/sku';
import { StockMovementId } from '../../src/modules/inventory/domain/value-objects/stock-movement-id';
import { InventoryItemOrmEntity } from '../../src/modules/inventory/infrastructure/persistence/inventory-item.orm-entity';
import { TypeOrmInventoryItemRepository } from '../../src/modules/inventory/infrastructure/persistence/typeorm-inventory-item.repository';
import { TypeOrmTransactionRunner } from '../../src/shared/infrastructure/database/typeorm-transaction-runner';
import { uniqueSku } from '../support/factories/sku.factory';
import { createTestDataSource } from '../support/db';

let dataSource: DataSource;
let repository: TypeOrmInventoryItemRepository;
let actorExternalId: string;

beforeAll(async () => {
  dataSource = createTestDataSource();
  await dataSource.initialize();
  repository = new TypeOrmInventoryItemRepository(
    dataSource.getRepository(InventoryItemOrmEntity),
    dataSource,
  );
  actorExternalId = await insertUser();
});

afterAll(async () => {
  await dataSource.destroy();
});

async function insertUser(): Promise<string> {
  const externalId = randomUUID();
  await dataSource.query(
    `INSERT INTO users (external_id, email, password_hash, name, document, status, created_at, updated_at)
     VALUES ($1, $2, 'hash', 'Test User', $3, 'ACTIVE', now(), now())`,
    [externalId, `${randomUUID()}@example.com`, Math.random().toString().slice(2, 13)],
  );
  return externalId;
}

// A work order over its own freshly created user, customer and vehicle - see
// inventory-item.repository.spec.ts's own copy of this helper for why a dedicated user avoids
// `ux_customers_user_id`.
async function insertWorkOrder(): Promise<string> {
  const workOrderExternalId = randomUUID();
  const userRows: Array<{ id: number }> = await dataSource.query(
    `INSERT INTO users (external_id, email, password_hash, name, document, status, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, 'hash', 'Jane Doe', $2, 'ACTIVE', now(), now())
     RETURNING id`,
    [`${randomUUID()}@example.com`, Math.random().toString().slice(2, 13)],
  );
  const customerRows: Array<{ id: number }> = await dataSource.query(
    `INSERT INTO customers (external_id, user_id, status, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, 'ACTIVE', now(), now())
     RETURNING id`,
    [userRows[0].id],
  );
  const vehicleRows: Array<{ id: number }> = await dataSource.query(
    `INSERT INTO vehicles (external_id, customer_id, plate, brand, model, year, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, 'Toyota', 'Corolla', 2020, now(), now())
     RETURNING id`,
    [customerRows[0].id, Math.random().toString(36).slice(2, 9).toUpperCase()],
  );
  await dataSource.query(
    `INSERT INTO work_orders (external_id, number, customer_id, vehicle_id, created_by_user_id, status, customer_name, vehicle_plate, vehicle_brand, vehicle_model, vehicle_year, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'IN_EXECUTION', 'Jane Doe', 'ABC1234', 'Toyota', 'Corolla', 2020, now(), now())`,
    [
      workOrderExternalId,
      `${Math.random().toString(36).slice(2, 8).toUpperCase()}-2026`,
      customerRows[0].id,
      vehicleRows[0].id,
      userRows[0].id,
    ],
  );
  return workOrderExternalId;
}

async function buildStockedItem(quantity = 10): Promise<InventoryItem> {
  const item = InventoryItem.create({
    id: InventoryItemId.create(randomUUID()),
    sku: Sku.create(uniqueSku()),
    name: 'Item de teste',
    description: 'Descricao',
    kind: InventoryItemKind.Part,
    unitPrice: Money.fromCents(2500),
    now: new Date(),
  });
  item.replenish({
    quantity,
    unitPrice: Money.fromCents(2500),
    actorUserId: actorExternalId,
    movementId: StockMovementId.create(randomUUID()),
    now: new Date(),
  });
  await repository.save(item);
  return item;
}

describe('TypeOrmInventoryItemRepository.findAllByIdsForUpdate', () => {
  it('returns the addressed items ordered by internal id, whatever order the ids arrived in', async () => {
    const first = await buildStockedItem();
    const second = await buildStockedItem();
    const runner = new TypeOrmTransactionRunner(dataSource);

    const found = await runner.run(() => repository.findAllByIdsForUpdate([second.id, first.id]));

    // Internal ids are assigned in insertion order, so `first` sorts before `second`.
    expect(found.map((item) => item.id.value)).toEqual([first.id.value, second.id.value]);
  });

  it('leaves an id matching nothing simply absent from the result, with no throw', async () => {
    const existing = await buildStockedItem();
    const unknownId = InventoryItemId.create(randomUUID());
    const runner = new TypeOrmTransactionRunner(dataSource);

    const found = await runner.run(() =>
      repository.findAllByIdsForUpdate([existing.id, unknownId]),
    );

    expect(found).toHaveLength(1);
    expect(found[0].id.value).toBe(existing.id.value);
  });

  it('returns an empty array for an empty batch', async () => {
    expect(await repository.findAllByIdsForUpdate([])).toEqual([]);
  });

  it('completes two overlapping batches naming the same two items in reversed order, with no deadlock', async () => {
    const itemA = await buildStockedItem();
    const itemB = await buildStockedItem();
    const workOrderExternalId = await insertWorkOrder();
    const runnerOne = new TypeOrmTransactionRunner(dataSource);
    const runnerTwo = new TypeOrmTransactionRunner(dataSource);

    const batchOne = runnerOne.run(async () => {
      const [a] = await repository.findAllByIdsForUpdate([itemA.id, itemB.id]);
      a.consume({
        quantity: 1,
        workOrderId: workOrderExternalId,
        actorUserId: actorExternalId,
        movementId: StockMovementId.create(randomUUID()),
        now: new Date(),
      });
      await repository.save(a);
    });
    const batchTwo = runnerTwo.run(async () => {
      const items = await repository.findAllByIdsForUpdate([itemB.id, itemA.id]);
      const b = items.find((candidate) => candidate.id.equals(itemB.id))!;
      b.consume({
        quantity: 1,
        workOrderId: workOrderExternalId,
        actorUserId: actorExternalId,
        movementId: StockMovementId.create(randomUUID()),
        now: new Date(),
      });
      await repository.save(b);
    });

    // Would hang or reject with a real deadlock (Postgres error 40P01) if the two batches took
    // their locks in the order the caller supplied rather than a deterministic one.
    await expect(Promise.all([batchOne, batchTwo])).resolves.toBeDefined();
  });

  it('leaves the count at zero and refuses the loser when two withdrawals race for the last unit', async () => {
    const item = await buildStockedItem(1);
    const workOrderExternalId = await insertWorkOrder();
    const runnerOne = new TypeOrmTransactionRunner(dataSource);
    const runnerTwo = new TypeOrmTransactionRunner(dataSource);

    const attemptOne = runnerOne.run(async () => {
      const [loaded] = await repository.findAllByIdsForUpdate([item.id]);
      loaded.consume({
        quantity: 1,
        workOrderId: workOrderExternalId,
        actorUserId: actorExternalId,
        movementId: StockMovementId.create(randomUUID()),
        now: new Date(),
      });
      await repository.save(loaded);
    });
    const attemptTwo = runnerTwo.run(async () => {
      const [loaded] = await repository.findAllByIdsForUpdate([item.id]);
      loaded.consume({
        quantity: 1,
        workOrderId: workOrderExternalId,
        actorUserId: actorExternalId,
        movementId: StockMovementId.create(randomUUID()),
        now: new Date(),
      });
      await repository.save(loaded);
    });

    const results = await Promise.allSettled([attemptOne, attemptTwo]);
    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    if (rejected[0]?.status === 'rejected') {
      expect(rejected[0].reason).toBeInstanceOf(InsufficientStockError);
    }

    const final = await repository.findById(item.id);
    expect(final?.quantityOnHand.units).toBe(0);
  });
});
