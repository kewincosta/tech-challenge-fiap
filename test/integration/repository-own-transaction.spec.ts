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
import { UserKeyResolver } from '../../src/modules/identity';
import { TypeOrmWorkOrderReads } from '../../src/modules/work-orders/infrastructure/persistence/typeorm-work-order-reads';
import { uniqueSku } from '../support/factories/sku.factory';
import { createTestDataSource } from '../support/db';

let dataSource: DataSource;
let repository: TypeOrmInventoryItemRepository;
let actorExternalId: string;

beforeAll(async () => {
  // The application's pool holds ten connections and waits for a free one with no timeout. This
  // pool holds two, so a save that takes a second connection while its transaction holds the first
  // starves its neighbor, and the short timeout turns that wait into an error the spec can see.
  dataSource = createTestDataSource({ poolSize: 2, connectTimeoutMS: 2000 });
  await dataSource.initialize();
  repository = new TypeOrmInventoryItemRepository(
    dataSource.getRepository(InventoryItemOrmEntity),
    dataSource,
    new TypeOrmWorkOrderReads(dataSource),
    new UserKeyResolver(dataSource),
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
    [externalId, `${externalId}@example.com`, Math.random().toString().slice(2, 13)],
  );
  return externalId;
}

// A work order over its own freshly created user, customer and vehicle, as the other inventory
// integration specs build one: a dedicated user avoids `ux_customers_user_id`.
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

/** An item with `quantity` on the shelf, saved and loaded back, so it carries no pending movement. */
async function stockedItem(quantity: number): Promise<InventoryItem> {
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
  return (await repository.findById(item.id))!;
}

describe('A repository that opens its own transaction', () => {
  it('should let two concurrent stock saves outside any transaction complete on a pool of two connections', async () => {
    const workOrderExternalId = await insertWorkOrder();
    const items = [await stockedItem(10), await stockedItem(10)];
    for (const item of items) {
      // Saving a consumption resolves its actor and its work order while the save's transaction is
      // open, through the user key resolver and the work order reads.
      item.consume({
        quantity: 3,
        workOrderId: workOrderExternalId,
        actorUserId: actorExternalId,
        movementId: StockMovementId.create(randomUUID()),
        now: new Date(),
      });
    }
    const consumptionIds = items.map((item) => item.newMovements[0].id.value);

    await Promise.all(items.map((item) => repository.save(item)));

    for (const [index, item] of items.entries()) {
      expect((await repository.findById(item.id))?.quantityOnHand.units).toBe(7);
      expect(await repository.findPendingConsumptions(item.id, workOrderExternalId)).toEqual([
        { movementId: consumptionIds[index], quantity: 3 },
      ]);
    }
  });
});
