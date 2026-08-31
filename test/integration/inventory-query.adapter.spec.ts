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
});
