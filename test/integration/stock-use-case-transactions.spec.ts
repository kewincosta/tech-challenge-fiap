import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { Money } from '../../src/shared/domain/value-objects/money';
import { CryptoIdGenerator } from '../../src/shared/infrastructure/ids/crypto-id-generator';
import { TypeOrmTransactionRunner } from '../../src/shared/infrastructure/database/typeorm-transaction-runner';
import { SystemClock } from '../../src/shared/infrastructure/time/system-clock';
import { ConsumeStockBatchCommand } from '../../src/modules/inventory/application/commands/consume-stock-batch/consume-stock-batch.command';
import { ConsumeStockBatchUseCase } from '../../src/modules/inventory/application/commands/consume-stock-batch/consume-stock-batch.use-case';
import { UndoConsumptionCommand } from '../../src/modules/inventory/application/commands/undo-consumption/undo-consumption.command';
import { UndoConsumptionUseCase } from '../../src/modules/inventory/application/commands/undo-consumption/undo-consumption.use-case';
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
import { uniqueWorkOrderNumber } from '../support/factories/work-order-number.factory';
import { RecordingDomainEventPublisher } from '../support/fakes/recording-domain-event-publisher';
import { createTestDataSource } from '../support/db';

// The stock use cases open their own transaction through the runner, so every call here arrives
// with no transaction open. A repository that waits or fails before a save stands in for a
// failure or a slow moment in the middle of the use case's transaction.
let dataSource: DataSource;
let runner: TypeOrmTransactionRunner;
let repository: TypeOrmInventoryItemRepository;
let workOrderReads: TypeOrmWorkOrderReads;
let userKeys: UserKeyResolver;
let actorId: string;

const idGenerator = new CryptoIdGenerator();
const clock = new SystemClock();
const events = new RecordingDomainEventPublisher();

beforeAll(async () => {
  dataSource = createTestDataSource();
  await dataSource.initialize();
  runner = new TypeOrmTransactionRunner(dataSource);
  workOrderReads = new TypeOrmWorkOrderReads(dataSource);
  userKeys = new UserKeyResolver(dataSource);
  repository = repositoryBefore(() => Promise.resolve());
  actorId = await insertUser();
});

afterAll(async () => {
  await dataSource.destroy();
});

/** A repository that runs `beforeSave(n)` ahead of its nth save, to wait there or to fail there. */
function repositoryBefore(
  beforeSave: (nth: number) => Promise<void>,
): TypeOrmInventoryItemRepository {
  class Interrupted extends TypeOrmInventoryItemRepository {
    private saves = 0;

    override async save(item: InventoryItem): Promise<void> {
      this.saves += 1;
      await beforeSave(this.saves);
      await super.save(item);
    }
  }
  return new Interrupted(
    dataSource.getRepository(InventoryItemOrmEntity),
    dataSource,
    workOrderReads,
    userKeys,
  );
}

function consumeWith(items: TypeOrmInventoryItemRepository): ConsumeStockBatchUseCase {
  return new ConsumeStockBatchUseCase(items, runner, idGenerator, clock, events);
}

function undoWith(items: TypeOrmInventoryItemRepository): UndoConsumptionUseCase {
  return new UndoConsumptionUseCase(items, runner, idGenerator, clock, events);
}

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
      uniqueWorkOrderNumber(),
      customerRows[0].id,
      vehicleRows[0].id,
      userRows[0].id,
    ],
  );
  return workOrderExternalId;
}

async function buildStockedItem(quantity: number): Promise<string> {
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
    actorUserId: actorId,
    movementId: StockMovementId.create(randomUUID()),
    now: new Date(),
  });
  await repository.save(item);
  return item.id.value;
}

async function quantityOf(itemId: string): Promise<number> {
  const rows: Array<{ quantity_on_hand: number }> = await dataSource.query(
    `SELECT quantity_on_hand FROM inventory_items WHERE external_id = $1`,
    [itemId],
  );
  return rows[0].quantity_on_hand;
}

async function movementKindsOf(itemId: string): Promise<string[]> {
  const rows: Array<{ kind: string }> = await dataSource.query(
    `SELECT sm.kind
       FROM stock_movements sm
       JOIN inventory_items ii ON ii.id = sm.inventory_item_id
      WHERE ii.external_id = $1
      ORDER BY sm.id`,
    [itemId],
  );
  return rows.map((row) => row.kind);
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function consumeCommand(
  workOrderId: string,
  operationId: string,
  lines: Array<{ inventoryItemId: string; quantity: number }>,
): ConsumeStockBatchCommand {
  return new ConsumeStockBatchCommand(lines, workOrderId, actorId, operationId);
}

describe('ConsumeStockBatchUseCase with a transaction of its own', () => {
  it('locks the items and commits the whole batch together when no transaction is open', async () => {
    const itemA = await buildStockedItem(10);
    const itemB = await buildStockedItem(6);
    const workOrderId = await insertWorkOrder();

    await consumeWith(repository).execute(
      consumeCommand(workOrderId, randomUUID(), [
        { inventoryItemId: itemA, quantity: 3 },
        { inventoryItemId: itemB, quantity: 2 },
      ]),
    );

    expect([await quantityOf(itemA), await quantityOf(itemB)]).toEqual([7, 4]);
    expect(await movementKindsOf(itemA)).toEqual(['INBOUND', 'CONSUMPTION']);
    expect(await movementKindsOf(itemB)).toEqual(['INBOUND', 'CONSUMPTION']);
  });

  it('rolls the whole batch back when a later item cannot be saved', async () => {
    const itemA = await buildStockedItem(10);
    const itemB = await buildStockedItem(6);
    const workOrderId = await insertWorkOrder();
    const failing = repositoryBefore((nth) =>
      nth === 2 ? Promise.reject(new Error('the second save failed')) : Promise.resolve(),
    );

    await expect(
      consumeWith(failing).execute(
        consumeCommand(workOrderId, randomUUID(), [
          { inventoryItemId: itemA, quantity: 3 },
          { inventoryItemId: itemB, quantity: 2 },
        ]),
      ),
    ).rejects.toThrow('the second save failed');

    expect([await quantityOf(itemA), await quantityOf(itemB)]).toEqual([10, 6]);
    expect(await movementKindsOf(itemA)).toEqual(['INBOUND']);
    expect(await movementKindsOf(itemB)).toEqual(['INBOUND']);
  });

  it('holds the lock on the items until its own transaction commits', async () => {
    const itemId = await buildStockedItem(10);
    const workOrderId = await insertWorkOrder();
    const reachedSave = deferred();
    const release = deferred();
    const holding = repositoryBefore(async () => {
      reachedSave.resolve();
      await release.promise;
    });
    const running = consumeWith(holding).execute(
      consumeCommand(workOrderId, randomUUID(), [{ inventoryItemId: itemId, quantity: 3 }]),
    );
    await Promise.race([reachedSave.promise, running]);

    // Another connection cannot lock the item while the use case's transaction is open.
    const competing = dataSource.query(
      `SELECT id FROM inventory_items WHERE external_id = $1 FOR UPDATE NOWAIT`,
      [itemId],
    );
    await expect(competing).rejects.toThrow(/could not obtain lock/);
    release.resolve();
    await running;

    expect(await quantityOf(itemId)).toBe(7);
  });
});

describe('UndoConsumptionUseCase with a transaction of its own', () => {
  async function withdraw(
    itemA: string,
    itemB: string,
  ): Promise<{ operationId: string; workOrderId: string }> {
    const operationId = randomUUID();
    const workOrderId = await insertWorkOrder();
    await consumeWith(repository).execute(
      consumeCommand(workOrderId, operationId, [
        { inventoryItemId: itemA, quantity: 3 },
        { inventoryItemId: itemB, quantity: 2 },
      ]),
    );
    return { operationId, workOrderId };
  }

  it('locks the items and commits every return together when no transaction is open', async () => {
    const itemA = await buildStockedItem(10);
    const itemB = await buildStockedItem(6);
    const { operationId } = await withdraw(itemA, itemB);

    await undoWith(repository).execute(new UndoConsumptionCommand(operationId, actorId));

    expect([await quantityOf(itemA), await quantityOf(itemB)]).toEqual([10, 6]);
    expect(await movementKindsOf(itemA)).toEqual(['INBOUND', 'CONSUMPTION', 'RETURN']);
    expect(await movementKindsOf(itemB)).toEqual(['INBOUND', 'CONSUMPTION', 'RETURN']);
  });

  it('rolls every return back when a later item cannot be saved', async () => {
    const itemA = await buildStockedItem(10);
    const itemB = await buildStockedItem(6);
    const { operationId } = await withdraw(itemA, itemB);
    const failing = repositoryBefore((nth) =>
      nth === 2 ? Promise.reject(new Error('the second save failed')) : Promise.resolve(),
    );

    await expect(
      undoWith(failing).execute(new UndoConsumptionCommand(operationId, actorId)),
    ).rejects.toThrow('the second save failed');

    expect([await quantityOf(itemA), await quantityOf(itemB)]).toEqual([7, 4]);
    expect(await movementKindsOf(itemA)).toEqual(['INBOUND', 'CONSUMPTION']);
    expect(await movementKindsOf(itemB)).toEqual(['INBOUND', 'CONSUMPTION']);
  });

  it('holds the lock on the items until its own transaction commits', async () => {
    const itemA = await buildStockedItem(10);
    const itemB = await buildStockedItem(6);
    const { operationId } = await withdraw(itemA, itemB);
    const reachedSave = deferred();
    const release = deferred();
    const holding = repositoryBefore(async () => {
      reachedSave.resolve();
      await release.promise;
    });
    const running = undoWith(holding).execute(new UndoConsumptionCommand(operationId, actorId));
    await Promise.race([reachedSave.promise, running]);

    const competing = dataSource.query(
      `SELECT id FROM inventory_items WHERE external_id = $1 FOR UPDATE NOWAIT`,
      [itemA],
    );
    await expect(competing).rejects.toThrow(/could not obtain lock/);
    release.resolve();
    await running;

    expect(await quantityOf(itemA)).toBe(10);
  });
});
