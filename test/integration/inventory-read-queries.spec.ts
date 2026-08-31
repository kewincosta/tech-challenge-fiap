import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { Money } from '../../src/shared/domain/value-objects/money';
import { GetInventoryItemHandler } from '../../src/modules/inventory/application/queries/get-inventory-item/get-inventory-item.handler';
import { GetInventoryItemQuery } from '../../src/modules/inventory/application/queries/get-inventory-item/get-inventory-item.query';
import { GetItemMovementHistoryHandler } from '../../src/modules/inventory/application/queries/get-item-movement-history/get-item-movement-history.handler';
import { GetItemMovementHistoryQuery } from '../../src/modules/inventory/application/queries/get-item-movement-history/get-item-movement-history.query';
import { ListInventoryItemsHandler } from '../../src/modules/inventory/application/queries/list-inventory-items/list-inventory-items.handler';
import { ListInventoryItemsQuery } from '../../src/modules/inventory/application/queries/list-inventory-items/list-inventory-items.query';
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
let getItemHandler: GetInventoryItemHandler;
let listItemsHandler: ListInventoryItemsHandler;
let getHistoryHandler: GetItemMovementHistoryHandler;
let actorExternalId: string;

beforeAll(async () => {
  dataSource = createTestDataSource();
  await dataSource.initialize();
  repository = new TypeOrmInventoryItemRepository(
    dataSource.getRepository(InventoryItemOrmEntity),
    dataSource,
  );
  const queryAdapter = new TypeOrmInventoryQueryAdapter(dataSource);
  getItemHandler = new GetInventoryItemHandler(queryAdapter);
  listItemsHandler = new ListInventoryItemsHandler(queryAdapter);
  getHistoryHandler = new GetItemMovementHistoryHandler(queryAdapter);
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

async function saveItem(overrides: { kind?: InventoryItemKind } = {}): Promise<InventoryItem> {
  const item = InventoryItem.create({
    id: InventoryItemId.create(randomUUID()),
    sku: Sku.create(uniqueSku()),
    name: 'Item de teste',
    kind: overrides.kind ?? InventoryItemKind.Part,
    unitPrice: Money.fromCents(2500),
    now: new Date(),
  });
  await repository.save(item);
  return item;
}

describe('Inventory read queries', () => {
  it('should get an item by its external id', async () => {
    const item = await saveItem();

    const found = await getItemHandler.execute(new GetInventoryItemQuery(item.id.value));

    expect(found?.id).toBe(item.id.value);
    expect(found?.sku).toBe(item.sku.value);
  });

  it('should return null for a malformed id, not throw', async () => {
    expect(await getItemHandler.execute(new GetInventoryItemQuery('not-a-uuid'))).toBeNull();
  });

  it('should list every active item', async () => {
    const item = await saveItem();

    const ids = (await listItemsHandler.execute(new ListInventoryItemsQuery())).map(
      (row) => row.id,
    );

    expect(ids).toContain(item.id.value);
  });

  it('should filter the list by kind when one is supplied', async () => {
    const part = await saveItem({ kind: InventoryItemKind.Part });
    const supply = await saveItem({ kind: InventoryItemKind.Supply });

    const ids = (await listItemsHandler.execute(new ListInventoryItemsQuery('PART'))).map(
      (row) => row.id,
    );

    expect(ids).toContain(part.id.value);
    expect(ids).not.toContain(supply.id.value);
  });

  it('should return the movement history in chronological order', async () => {
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

    const history = await getHistoryHandler.execute(new GetItemMovementHistoryQuery(item.id.value));

    expect(history).toHaveLength(2);
    expect(history[0].kind).toBe('INBOUND');
    expect(history[1].kind).toBe('ADJUSTMENT');
  });

  it('should return an empty history for a freshly created item', async () => {
    const item = await saveItem();

    const history = await getHistoryHandler.execute(new GetItemMovementHistoryQuery(item.id.value));

    expect(history).toEqual([]);
  });
});
