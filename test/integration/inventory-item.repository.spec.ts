import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { Money } from '../../src/shared/domain/value-objects/money';
import { InventoryItem } from '../../src/modules/inventory/domain/entities/inventory-item';
import { InsufficientStockError } from '../../src/modules/inventory/domain/errors/insufficient-stock.error';
import { SkuAlreadyInUseError } from '../../src/modules/inventory/domain/errors/sku-already-in-use.error';
import { InventoryItemKind } from '../../src/modules/inventory/domain/inventory-item-kind';
import { InventoryItemId } from '../../src/modules/inventory/domain/value-objects/inventory-item-id';
import { Sku } from '../../src/modules/inventory/domain/value-objects/sku';
import { StockMovementId } from '../../src/modules/inventory/domain/value-objects/stock-movement-id';
import { StockQuantity } from '../../src/modules/inventory/domain/value-objects/stock-quantity';
import { InventoryItemOrmEntity } from '../../src/modules/inventory/infrastructure/persistence/inventory-item.orm-entity';
import { TypeOrmInventoryItemRepository } from '../../src/modules/inventory/infrastructure/persistence/typeorm-inventory-item.repository';
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

// A user is created here through a raw insert, matching session.repository.spec.ts's own
// convention, rather than through a repository this module has no reason to depend on.
async function insertUser(): Promise<string> {
  const externalId = randomUUID();
  await dataSource.query(
    `INSERT INTO users (external_id, email, password_hash, name, document, status, created_at, updated_at)
     VALUES ($1, $2, 'hash', 'Test User', $3, 'ACTIVE', now(), now())`,
    [externalId, `${externalId}@example.com`, Math.random().toString().slice(2, 13)],
  );
  return externalId;
}

function movementId(): StockMovementId {
  return StockMovementId.create(randomUUID());
}

// A work order is created here through a raw insert, over its own freshly created user, customer
// and vehicle - this module has no reason to depend on the work-orders repository, and AD-003
// forbids importing it (typeorm-work-order-query.adapter.ts follows the same raw-SQL-across-
// modules precedent for reads). A dedicated user avoids colliding with `ux_customers_user_id`,
// which the shared `actorExternalId` would hit on a second call.
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

function buildItem(overrides: { sku?: string } = {}): InventoryItem {
  return InventoryItem.create({
    id: InventoryItemId.create(randomUUID()),
    sku: Sku.create(overrides.sku ?? uniqueSku()),
    name: 'Item de teste',
    description: 'Descricao',
    kind: InventoryItemKind.Part,
    unitPrice: Money.fromCents(2500),
    now: new Date(),
  });
}

describe('TypeOrmInventoryItemRepository', () => {
  it('should round-trip a save-then-find with the quantity on hand intact', async () => {
    const item = buildItem();
    item.replenish({
      quantity: 10,
      unitPrice: Money.fromCents(2500),
      actorUserId: actorExternalId,
      movementId: movementId(),
      now: new Date(),
    });

    await repository.save(item);
    const found = await repository.findById(item.id);

    expect(found?.sku.value).toBe(item.sku.value);
    expect(found?.quantityOnHand.units).toBe(10);
  });

  it('should never attach movements from findById, however many the item has', async () => {
    const item = buildItem();
    item.replenish({
      quantity: 5,
      unitPrice: Money.fromCents(2500),
      actorUserId: actorExternalId,
      movementId: movementId(),
      now: new Date(),
    });
    await repository.save(item);

    const found = await repository.findById(item.id);

    expect(found?.newMovements).toHaveLength(0);
  });

  it("should write the item's new count and the movement row in one transaction on replenish", async () => {
    const item = buildItem();
    await repository.save(item);
    const loaded = await repository.findById(item.id);
    loaded!.replenish({
      quantity: 7,
      unitPrice: Money.fromCents(2500),
      actorUserId: actorExternalId,
      movementId: movementId(),
      now: new Date(),
    });

    await repository.save(loaded!);

    const itemRows: Array<{ quantity_on_hand: number }> = await dataSource.query(
      `SELECT quantity_on_hand FROM inventory_items WHERE external_id = $1`,
      [item.id.value],
    );
    const movementRows: Array<{ quantity: number }> = await dataSource.query(
      `SELECT sm.quantity FROM stock_movements sm
         JOIN inventory_items ii ON ii.id = sm.inventory_item_id
        WHERE ii.external_id = $1`,
      [item.id.value],
    );
    expect(itemRows[0].quantity_on_hand).toBe(7);
    expect(movementRows).toHaveLength(1);
    expect(movementRows[0].quantity).toBe(7);
  });

  it('should leave neither the count nor a movement row when the write fails', async () => {
    const item = buildItem();
    await repository.save(item);
    const reusedMovementId = movementId();
    const first = await repository.findById(item.id);
    first!.replenish({
      quantity: 4,
      unitPrice: Money.fromCents(2500),
      actorUserId: actorExternalId,
      movementId: reusedMovementId,
      now: new Date(),
    });
    await repository.save(first!);

    // Forces a real database failure mid-transaction (a duplicate movement external_id violates
    // ux_stock_movements_external_id) - the domain layer cannot see this coming, only Postgres can.
    const second = await repository.findById(item.id);
    second!.replenish({
      quantity: 6,
      unitPrice: Money.fromCents(2500),
      actorUserId: actorExternalId,
      movementId: reusedMovementId,
      now: new Date(),
    });

    await expect(repository.save(second!)).rejects.toThrow();

    const itemRows: Array<{ quantity_on_hand: number }> = await dataSource.query(
      `SELECT quantity_on_hand FROM inventory_items WHERE external_id = $1`,
      [item.id.value],
    );
    const movementRows: Array<{ id: string }> = await dataSource.query(
      `SELECT sm.id FROM stock_movements sm
         JOIN inventory_items ii ON ii.id = sm.inventory_item_id
        WHERE ii.external_id = $1`,
      [item.id.value],
    );
    // Still 4 from the first, successful save - the second, failed one changed nothing (AD-007).
    expect(itemRows[0].quantity_on_hand).toBe(4);
    expect(movementRows).toHaveLength(1);
  });

  it('should append no movement row when an adjustment would go negative', async () => {
    const item = buildItem();
    item.replenish({
      quantity: 5,
      unitPrice: Money.fromCents(2500),
      actorUserId: actorExternalId,
      movementId: movementId(),
      now: new Date(),
    });
    await repository.save(item);
    const loaded = await repository.findById(item.id);

    expect(() =>
      loaded!.adjustDown({
        quantity: 6,
        actorUserId: actorExternalId,
        note: 'Contagem divergente',
        movementId: movementId(),
        now: new Date(),
      }),
    ).toThrow(InsufficientStockError);

    const movementRows: Array<{ id: string }> = await dataSource.query(
      `SELECT sm.id FROM stock_movements sm
         JOIN inventory_items ii ON ii.id = sm.inventory_item_id
        WHERE ii.external_id = $1 AND sm.kind = 'ADJUSTMENT'`,
      [item.id.value],
    );
    expect(movementRows).toHaveLength(0);
  });

  it('should leave the count equal to the sum of two concurrent replenishments', async () => {
    const item = buildItem();
    await repository.save(item);

    const first = await repository.findById(item.id);
    const second = await repository.findById(item.id);
    first!.replenish({
      quantity: 5,
      unitPrice: Money.fromCents(2500),
      actorUserId: actorExternalId,
      movementId: movementId(),
      now: new Date(),
    });
    second!.replenish({
      quantity: 3,
      unitPrice: Money.fromCents(2500),
      actorUserId: actorExternalId,
      movementId: movementId(),
      now: new Date(),
    });

    // Two overlapping transactions on two real connections from the same pool - Postgres, not
    // application code, is what has to serialise them (design.md's Risks & Concerns).
    await Promise.all([repository.save(first!), repository.save(second!)]);

    const found = await repository.findById(item.id);
    expect(found?.quantityOnHand.units).toBe(8);
  });

  it('should reload the unit price as a number on both tables even though the driver returns bigint as a string', async () => {
    const item = buildItem();
    item.replenish({
      quantity: 1,
      unitPrice: Money.fromCents(4321),
      actorUserId: actorExternalId,
      movementId: movementId(),
      now: new Date(),
    });
    await repository.save(item);

    const itemRaw: Array<{ unit_price_cents: string }> = await dataSource.query(
      `SELECT unit_price_cents FROM inventory_items WHERE external_id = $1`,
      [item.id.value],
    );
    const movementRaw: Array<{ unit_price_cents: string }> = await dataSource.query(
      `SELECT sm.unit_price_cents FROM stock_movements sm
         JOIN inventory_items ii ON ii.id = sm.inventory_item_id
        WHERE ii.external_id = $1`,
      [item.id.value],
    );
    const found = await repository.findById(item.id);

    expect(typeof itemRaw[0].unit_price_cents).toBe('string');
    expect(typeof movementRaw[0].unit_price_cents).toBe('string');
    expect(found?.unitPrice.cents).toBe(2500);
    expect(typeof found?.unitPrice.cents).toBe('number');
  });

  it('should match existsActiveBySku on the normalised SKU', async () => {
    const sku = uniqueSku();
    await repository.save(buildItem({ sku }));

    expect(await repository.existsActiveBySku(Sku.create(sku.toLowerCase()))).toBe(true);
    expect(await repository.existsActiveBySku(Sku.create(uniqueSku()))).toBe(false);
  });

  it("should map a duplicate active SKU's unique-index violation to SkuAlreadyInUseError", async () => {
    const sku = uniqueSku();
    await repository.save(buildItem({ sku }));

    // Bypasses the application-layer pre-check on purpose: this is the concurrent case, where two
    // writers both pass the check and the database is the only thing left to stop the second.
    await expect(repository.save(buildItem({ sku: sku.toLowerCase() }))).rejects.toThrow(
      SkuAlreadyInUseError,
    );
  });

  it("should resolve actor_user_id from the acting user's external id at the repository boundary", async () => {
    const item = buildItem();
    item.replenish({
      quantity: 1,
      unitPrice: Money.fromCents(2500),
      actorUserId: actorExternalId,
      movementId: movementId(),
      now: new Date(),
    });
    await repository.save(item);

    const rows: Array<{ external_id: string }> = await dataSource.query(
      `SELECT u.external_id FROM stock_movements sm
         JOIN inventory_items ii ON ii.id = sm.inventory_item_id
         JOIN users u ON u.id = sm.actor_user_id
        WHERE ii.external_id = $1`,
      [item.id.value],
    );
    expect(rows[0].external_id).toBe(actorExternalId);
  });

  it('should end a withdraw-then-return-in-full round trip at the starting count, with three movements on the ledger', async () => {
    const item = buildItem();
    item.replenish({
      quantity: 10,
      unitPrice: Money.fromCents(2500),
      actorUserId: actorExternalId,
      movementId: movementId(),
      now: new Date(),
    });
    await repository.save(item);
    const workOrderExternalId = await insertWorkOrder();

    const reloaded: Array<{ quantity_on_hand: number }> = await dataSource.query(
      `SELECT quantity_on_hand FROM inventory_items WHERE external_id = $1`,
      [item.id.value],
    );
    expect(reloaded[0].quantity_on_hand).toBe(10);

    const consuming = InventoryItem.restore({
      id: item.id,
      sku: item.sku,
      name: item.name,
      description: item.description,
      kind: item.kind,
      unitPrice: item.unitPrice,
      quantityOnHand: item.quantityOnHand,
      status: item.status,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    });
    const consumeMovementId = movementId();
    consuming.consume({
      quantity: 3,
      workOrderId: workOrderExternalId,
      actorUserId: actorExternalId,
      movementId: consumeMovementId,
      now: new Date(),
    });
    await repository.save(consuming);

    const returning = InventoryItem.restore({
      id: item.id,
      sku: item.sku,
      name: item.name,
      description: item.description,
      kind: item.kind,
      unitPrice: item.unitPrice,
      quantityOnHand: StockQuantity.of(7),
      status: item.status,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    });
    returning.restoreUnits({
      quantity: 3,
      workOrderId: workOrderExternalId,
      actorUserId: actorExternalId,
      movementId: movementId(),
      undoesMovementId: consumeMovementId.value,
      now: new Date(),
    });
    await repository.save(returning);

    const final: Array<{ quantity_on_hand: number }> = await dataSource.query(
      `SELECT quantity_on_hand FROM inventory_items WHERE external_id = $1`,
      [item.id.value],
    );
    expect(final[0].quantity_on_hand).toBe(10);
    const movementRows: Array<{ kind: string }> = await dataSource.query(
      `SELECT sm.kind FROM stock_movements sm
         JOIN inventory_items ii ON ii.id = sm.inventory_item_id
        WHERE ii.external_id = $1`,
      [item.id.value],
    );
    expect(movementRows).toHaveLength(3);
  });

  it("should persist a CONSUMPTION's status, resolved work order internal id and catalog unit price", async () => {
    const item = buildItem();
    item.replenish({
      quantity: 5,
      unitPrice: Money.fromCents(3000),
      actorUserId: actorExternalId,
      movementId: movementId(),
      now: new Date(),
    });
    await repository.save(item);
    const workOrderExternalId = await insertWorkOrder();

    const consuming = InventoryItem.restore({
      id: item.id,
      sku: item.sku,
      name: item.name,
      description: item.description,
      kind: item.kind,
      unitPrice: Money.fromCents(3000),
      quantityOnHand: item.quantityOnHand,
      status: item.status,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    });
    consuming.consume({
      quantity: 2,
      workOrderId: workOrderExternalId,
      actorUserId: actorExternalId,
      movementId: movementId(),
      now: new Date(),
    });
    await repository.save(consuming);

    const rows: Array<{ status: string; unit_price_cents: string; work_order_external_id: string }> =
      await dataSource.query(
        `SELECT sm.status, sm.unit_price_cents, wo.external_id AS work_order_external_id
           FROM stock_movements sm
           JOIN inventory_items ii ON ii.id = sm.inventory_item_id
           JOIN work_orders wo ON wo.id = sm.work_order_id
          WHERE ii.external_id = $1 AND sm.kind = 'CONSUMPTION'`,
        [item.id.value],
      );
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('PENDING');
    expect(Number(rows[0].unit_price_cents)).toBe(3000);
    expect(rows[0].work_order_external_id).toBe(workOrderExternalId);
  });

  it('should persist a RETURN movement with a null status and undoes_movement_id resolved to the original consumption', async () => {
    const item = buildItem();
    item.replenish({
      quantity: 5,
      unitPrice: Money.fromCents(2500),
      actorUserId: actorExternalId,
      movementId: movementId(),
      now: new Date(),
    });
    await repository.save(item);
    const workOrderExternalId = await insertWorkOrder();
    const consumeMovementId = movementId();
    const consuming = InventoryItem.restore({
      id: item.id,
      sku: item.sku,
      name: item.name,
      description: item.description,
      kind: item.kind,
      unitPrice: item.unitPrice,
      quantityOnHand: item.quantityOnHand,
      status: item.status,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    });
    consuming.consume({
      quantity: 2,
      workOrderId: workOrderExternalId,
      actorUserId: actorExternalId,
      movementId: consumeMovementId,
      now: new Date(),
    });
    await repository.save(consuming);

    const returning = InventoryItem.restore({
      id: item.id,
      sku: item.sku,
      name: item.name,
      description: item.description,
      kind: item.kind,
      unitPrice: item.unitPrice,
      quantityOnHand: StockQuantity.of(3),
      status: item.status,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    });
    returning.restoreUnits({
      quantity: 1,
      workOrderId: workOrderExternalId,
      actorUserId: actorExternalId,
      movementId: movementId(),
      undoesMovementId: consumeMovementId.value,
      now: new Date(),
    });
    await repository.save(returning);

    const rows: Array<{ status: string | null; undoes_external_id: string }> =
      await dataSource.query(
        `SELECT sm.status, undone.external_id AS undoes_external_id
           FROM stock_movements sm
           JOIN inventory_items ii ON ii.id = sm.inventory_item_id
           JOIN stock_movements undone ON undone.id = sm.undoes_movement_id
          WHERE ii.external_id = $1 AND sm.kind = 'RETURN'`,
        [item.id.value],
      );
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBeNull();
    expect(rows[0].undoes_external_id).toBe(consumeMovementId.value);
  });
});
