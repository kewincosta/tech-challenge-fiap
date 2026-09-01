import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { Money } from '../../src/shared/domain/value-objects/money';
import { InventoryItem } from '../../src/modules/inventory/domain/entities/inventory-item';
import { InventoryItemKind } from '../../src/modules/inventory/domain/inventory-item-kind';
import { InventoryItemId } from '../../src/modules/inventory/domain/value-objects/inventory-item-id';
import { Sku } from '../../src/modules/inventory/domain/value-objects/sku';
import { StockMovementId } from '../../src/modules/inventory/domain/value-objects/stock-movement-id';
import { InventoryItemOrmEntity } from '../../src/modules/inventory/infrastructure/persistence/inventory-item.orm-entity';
import { TypeOrmInventoryItemRepository } from '../../src/modules/inventory/infrastructure/persistence/typeorm-inventory-item.repository';
import { TypeOrmInventoryQueryAdapter } from '../../src/modules/inventory/infrastructure/persistence/typeorm-inventory-query.adapter';
import { uniqueSku } from '../support/factories/sku.factory';
import { createTestDataSource } from '../support/db';

let dataSource: DataSource;
let repository: TypeOrmInventoryItemRepository;
let queryAdapter: TypeOrmInventoryQueryAdapter;
let actorExternalId: string;

beforeAll(async () => {
  dataSource = createTestDataSource();
  await dataSource.initialize();
  repository = new TypeOrmInventoryItemRepository(
    dataSource.getRepository(InventoryItemOrmEntity),
    dataSource,
  );
  queryAdapter = new TypeOrmInventoryQueryAdapter(dataSource);
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
    [externalId, `${externalId}@example.com`, Math.random().toString().slice(2, 13)],
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

async function saveItem(
  overrides: {
    sku?: string;
    kind?: InventoryItemKind;
    priceCents?: number;
  } = {},
): Promise<InventoryItem> {
  const item = InventoryItem.create({
    id: InventoryItemId.create(randomUUID()),
    sku: Sku.create(overrides.sku ?? uniqueSku()),
    name: 'Item de teste',
    description: 'Descricao',
    kind: overrides.kind ?? InventoryItemKind.Part,
    unitPrice: Money.fromCents(overrides.priceCents ?? 2500),
    now: new Date(),
  });
  await repository.save(item);
  return item;
}

describe('TypeOrmInventoryQueryAdapter', () => {
  it("should return an item's summary from getById", async () => {
    const item = await saveItem({ priceCents: 3000 });

    const found = await queryAdapter.getById(item.id.value);

    expect(found).toMatchObject({
      id: item.id.value,
      sku: item.sku.value,
      name: 'Item de teste',
      kind: 'PART',
      unitPriceCents: 3000,
      quantityOnHand: 0,
      status: 'ACTIVE',
    });
  });

  it('should return null from getById for an unknown external id', async () => {
    expect(await queryAdapter.getById(randomUUID())).toBeNull();
  });

  it('should list every active item', async () => {
    const item = await saveItem();

    const found = await queryAdapter.listActive();

    expect(found.some((row) => row.id === item.id.value)).toBe(true);
  });

  it('should filter listActive by kind when one is supplied', async () => {
    const part = await saveItem({ kind: InventoryItemKind.Part });
    const supply = await saveItem({ kind: InventoryItemKind.Supply });

    const parts = await queryAdapter.listActive('PART');

    expect(parts.some((row) => row.id === part.id.value)).toBe(true);
    expect(parts.some((row) => row.id === supply.id.value)).toBe(false);
  });

  it("should list movements in chronological order with the actor's external id", async () => {
    const item = await saveItem();
    const loaded1 = await repository.findById(item.id);
    loaded1!.replenish({
      quantity: 5,
      unitPrice: Money.fromCents(2500),
      actorUserId: actorExternalId,
      movementId: StockMovementId.create(randomUUID()),
      now: new Date('2026-08-30T10:00:00.000Z'),
    });
    await repository.save(loaded1!);
    const loaded2 = await repository.findById(item.id);
    loaded2!.adjustDown({
      quantity: 2,
      actorUserId: actorExternalId,
      note: 'Contagem divergente',
      movementId: StockMovementId.create(randomUUID()),
      now: new Date('2026-08-31T10:00:00.000Z'),
    });
    await repository.save(loaded2!);

    const movements = await queryAdapter.listMovements(item.id.value);

    expect(movements).toHaveLength(2);
    expect(movements[0].kind).toBe('INBOUND');
    expect(movements[1].kind).toBe('ADJUSTMENT');
    expect(movements[0].actorUserId).toBe(actorExternalId);
  });

  it('should return an empty list from listMovements for an item with no movements', async () => {
    const item = await saveItem();

    expect(await queryAdapter.listMovements(item.id.value)).toEqual([]);
  });

  it('should return prices as numbers on both getById and listMovements', async () => {
    const item = await saveItem({ priceCents: 4321 });
    const loaded = await repository.findById(item.id);
    loaded!.replenish({
      quantity: 1,
      unitPrice: Money.fromCents(1234),
      actorUserId: actorExternalId,
      movementId: StockMovementId.create(randomUUID()),
      now: new Date(),
    });
    await repository.save(loaded!);

    const found = await queryAdapter.getById(item.id.value);
    const movements = await queryAdapter.listMovements(item.id.value);

    expect(typeof found?.unitPriceCents).toBe('number');
    expect(found?.unitPriceCents).toBe(4321);
    expect(typeof movements[0].unitPriceCents).toBe('number');
    expect(movements[0].unitPriceCents).toBe(1234);
  });

  it('should leave status, workOrderId and undoesMovementId null on an INBOUND movement', async () => {
    const item = await saveItem();
    const loaded = await repository.findById(item.id);
    loaded!.replenish({
      quantity: 5,
      unitPrice: Money.fromCents(2500),
      actorUserId: actorExternalId,
      movementId: StockMovementId.create(randomUUID()),
      now: new Date(),
    });
    await repository.save(loaded!);

    const movements = await queryAdapter.listMovements(item.id.value);

    expect(movements[0].status).toBeNull();
    expect(movements[0].workOrderId).toBeNull();
    expect(movements[0].undoesMovementId).toBeNull();
  });

  it("should read back a CONSUMPTION's PENDING status and the work order's own external id", async () => {
    const item = await saveItem();
    const workOrderExternalId = await insertWorkOrder();
    const stocked = await repository.findById(item.id);
    stocked!.replenish({
      quantity: 5,
      unitPrice: Money.fromCents(2500),
      actorUserId: actorExternalId,
      movementId: StockMovementId.create(randomUUID()),
      note: null,
      now: new Date(),
    });
    await repository.save(stocked!);
    const loaded = await repository.findById(item.id);
    loaded!.consume({
      quantity: 2,
      workOrderId: workOrderExternalId,
      actorUserId: actorExternalId,
      movementId: StockMovementId.create(randomUUID()),
      now: new Date(),
    });
    await repository.save(loaded!);

    const movements = await queryAdapter.listMovements(item.id.value);
    const consumption = movements.find((movement) => movement.kind === 'CONSUMPTION');

    expect(consumption?.status).toBe('PENDING');
    expect(consumption?.workOrderId).toBe(workOrderExternalId);
  });

  it("should read back a RETURN's null status and its undoesMovementId pointing at the consumption's own external id", async () => {
    const item = await saveItem();
    const workOrderExternalId = await insertWorkOrder();
    const stocked = await repository.findById(item.id);
    stocked!.replenish({
      quantity: 5,
      unitPrice: Money.fromCents(2500),
      actorUserId: actorExternalId,
      movementId: StockMovementId.create(randomUUID()),
      note: null,
      now: new Date(),
    });
    await repository.save(stocked!);
    const consumeMovementId = StockMovementId.create(randomUUID());
    const consuming = await repository.findById(item.id);
    consuming!.consume({
      quantity: 2,
      workOrderId: workOrderExternalId,
      actorUserId: actorExternalId,
      movementId: consumeMovementId,
      now: new Date(),
    });
    await repository.save(consuming!);

    const returning = await repository.findById(item.id);
    returning!.restoreUnits({
      quantity: 1,
      workOrderId: workOrderExternalId,
      actorUserId: actorExternalId,
      movementId: StockMovementId.create(randomUUID()),
      undoesMovementId: consumeMovementId.value,
      now: new Date(),
    });
    await repository.save(returning!);

    const movements = await queryAdapter.listMovements(item.id.value);
    const returnMovement = movements.find((movement) => movement.kind === 'RETURN');

    expect(returnMovement?.status).toBeNull();
    expect(returnMovement?.undoesMovementId).toBe(consumeMovementId.value);
  });
});
