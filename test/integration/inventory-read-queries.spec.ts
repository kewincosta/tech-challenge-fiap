import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { Money } from '../../src/shared/domain/value-objects/money';
import { GetInventoryItemUseCase } from '../../src/modules/inventory/application/queries/get-inventory-item/get-inventory-item.use-case';
import { GetInventoryItemQuery } from '../../src/modules/inventory/application/queries/get-inventory-item/get-inventory-item.query';
import { GetItemMovementHistoryUseCase } from '../../src/modules/inventory/application/queries/get-item-movement-history/get-item-movement-history.use-case';
import { GetItemMovementHistoryQuery } from '../../src/modules/inventory/application/queries/get-item-movement-history/get-item-movement-history.query';
import { ListInventoryItemsUseCase } from '../../src/modules/inventory/application/queries/list-inventory-items/list-inventory-items.use-case';
import { ListInventoryItemsQuery } from '../../src/modules/inventory/application/queries/list-inventory-items/list-inventory-items.query';
import { InventoryItem } from '../../src/modules/inventory/domain/entities/inventory-item';
import { InventoryItemNotFoundError } from '../../src/modules/inventory/domain/errors/inventory-item-not-found.error';
import { InventoryItemKind } from '../../src/modules/inventory/domain/inventory-item-kind';
import { InventoryItemId } from '../../src/modules/inventory/domain/value-objects/inventory-item-id';
import { Sku } from '../../src/modules/inventory/domain/value-objects/sku';
import { StockMovementId } from '../../src/modules/inventory/domain/value-objects/stock-movement-id';
import { InventoryItemOrmEntity } from '../../src/modules/inventory/infrastructure/persistence/inventory-item.orm-entity';
import { TypeOrmInventoryItemRepository } from '../../src/modules/inventory/infrastructure/persistence/typeorm-inventory-item.repository';
import { TypeOrmInventoryQueryAdapter } from '../../src/modules/inventory/infrastructure/persistence/typeorm-inventory-query.adapter';
import { UserKeyResolver } from '../../src/modules/identity';
import { TypeOrmWorkOrderReads } from '../../src/modules/work-orders/infrastructure/persistence/typeorm-work-order-reads';
import { uniqueSku } from '../support/factories/sku.factory';
import { createTestDataSource } from '../support/db';

let dataSource: DataSource;
let repository: TypeOrmInventoryItemRepository;
let getItem: GetInventoryItemUseCase;
let listItems: ListInventoryItemsUseCase;
let getHistory: GetItemMovementHistoryUseCase;
let actorExternalId: string;

beforeAll(async () => {
  dataSource = createTestDataSource();
  await dataSource.initialize();
  repository = new TypeOrmInventoryItemRepository(
    dataSource.getRepository(InventoryItemOrmEntity),
    dataSource,
    new TypeOrmWorkOrderReads(dataSource),
    new UserKeyResolver(dataSource),
  );
  const queryAdapter = new TypeOrmInventoryQueryAdapter(
    dataSource,
    new TypeOrmWorkOrderReads(dataSource),
    new UserKeyResolver(dataSource),
  );
  getItem = new GetInventoryItemUseCase(queryAdapter);
  listItems = new ListInventoryItemsUseCase(queryAdapter);
  getHistory = new GetItemMovementHistoryUseCase(queryAdapter);
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

    const found = await getItem.execute(new GetInventoryItemQuery(item.id.value));

    expect(found?.id).toBe(item.id.value);
    expect(found?.sku).toBe(item.sku.value);
  });

  it('should refuse a malformed id with the inventory item not-found error, not a database error', async () => {
    await expect(getItem.execute(new GetInventoryItemQuery('not-a-uuid'))).rejects.toThrow(
      InventoryItemNotFoundError,
    );
  });

  it('should list every active item', async () => {
    const item = await saveItem();

    const ids = (await listItems.execute(new ListInventoryItemsQuery())).map((row) => row.id);

    expect(ids).toContain(item.id.value);
  });

  it('should filter the list by kind when one is supplied', async () => {
    const part = await saveItem({ kind: InventoryItemKind.Part });
    const supply = await saveItem({ kind: InventoryItemKind.Supply });

    const ids = (await listItems.execute(new ListInventoryItemsQuery('PART'))).map((row) => row.id);

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

    const history = await getHistory.execute(new GetItemMovementHistoryQuery(item.id.value));

    expect(history).toHaveLength(2);
    expect(history[0].kind).toBe('INBOUND');
    expect(history[1].kind).toBe('ADJUSTMENT');
  });

  it('should return an empty history for a freshly created item', async () => {
    const item = await saveItem();

    const history = await getHistory.execute(new GetItemMovementHistoryQuery(item.id.value));

    expect(history).toEqual([]);
  });
});
