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
});
