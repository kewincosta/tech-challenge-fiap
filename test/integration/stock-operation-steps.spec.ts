import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { Money } from '../../src/shared/domain/value-objects/money';
import { CryptoIdGenerator } from '../../src/shared/infrastructure/ids/crypto-id-generator';
import { TypeOrmTransactionRunner } from '../../src/shared/infrastructure/database/typeorm-transaction-runner';
import { SystemClock } from '../../src/shared/infrastructure/time/system-clock';
import { ConsumeStockBatchCommand } from '../../src/modules/inventory/application/commands/consume-stock-batch/consume-stock-batch.command';
import { ConsumeStockBatchUseCase } from '../../src/modules/inventory/application/commands/consume-stock-batch/consume-stock-batch.use-case';
import { RestoreStockBatchCommand } from '../../src/modules/inventory/application/commands/restore-stock-batch/restore-stock-batch.command';
import { RestoreStockBatchUseCase } from '../../src/modules/inventory/application/commands/restore-stock-batch/restore-stock-batch.use-case';
import { SettleStockMovementsCommand } from '../../src/modules/inventory/application/commands/settle-stock-movements/settle-stock-movements.command';
import { SettleStockMovementsUseCase } from '../../src/modules/inventory/application/commands/settle-stock-movements/settle-stock-movements.use-case';
import { UndoConsumptionCommand } from '../../src/modules/inventory/application/commands/undo-consumption/undo-consumption.command';
import { UndoConsumptionUseCase } from '../../src/modules/inventory/application/commands/undo-consumption/undo-consumption.use-case';
import { InventoryItem } from '../../src/modules/inventory/domain/entities/inventory-item';
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
import { RecordingDomainEventPublisher } from '../support/fakes/recording-domain-event-publisher';
import { createTestDataSource } from '../support/db';

let dataSource: DataSource;
let repository: TypeOrmInventoryItemRepository;
let queryAdapter: TypeOrmInventoryQueryAdapter;
let runner: TypeOrmTransactionRunner;
let consumeStock: ConsumeStockBatchUseCase;
let restoreStock: RestoreStockBatchUseCase;
let undoStock: UndoConsumptionUseCase;
let settleStock: SettleStockMovementsUseCase;
let withdrawerId: string;
let undoerId: string;

beforeAll(async () => {
  dataSource = createTestDataSource();
  await dataSource.initialize();
  const workOrderReads = new TypeOrmWorkOrderReads(dataSource);
  const userKeys = new UserKeyResolver(dataSource);
  repository = new TypeOrmInventoryItemRepository(
    dataSource.getRepository(InventoryItemOrmEntity),
    dataSource,
    workOrderReads,
    userKeys,
  );
  queryAdapter = new TypeOrmInventoryQueryAdapter(dataSource, workOrderReads, userKeys);
  runner = new TypeOrmTransactionRunner(dataSource);
  const idGenerator = new CryptoIdGenerator();
  const clock = new SystemClock();
  const events = new RecordingDomainEventPublisher();
  consumeStock = new ConsumeStockBatchUseCase(repository, idGenerator, clock, events);
  restoreStock = new RestoreStockBatchUseCase(repository, idGenerator, clock, events);
  undoStock = new UndoConsumptionUseCase(repository, idGenerator, clock, events);
  settleStock = new SettleStockMovementsUseCase(repository, clock);
  withdrawerId = await insertUser();
  undoerId = await insertUser();
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
    actorUserId: withdrawerId,
    movementId: StockMovementId.create(randomUUID()),
    now: new Date(),
  });
  await repository.save(item);
  return item.id.value;
}

function withdraw(
  operationId: string,
  workOrderId: string,
  lines: Array<{ inventoryItemId: string; quantity: number }>,
): Promise<unknown> {
  return runner.run(() =>
    consumeStock.execute(
      new ConsumeStockBatchCommand(lines, workOrderId, withdrawerId, operationId),
    ),
  );
}

function returnParts(
  operationId: string,
  workOrderId: string,
  lines: Array<{ inventoryItemId: string; quantity: number }>,
): Promise<unknown> {
  return runner.run(() =>
    restoreStock.execute(
      new RestoreStockBatchCommand(lines, workOrderId, withdrawerId, operationId),
    ),
  );
}

function undo(operationId: string): Promise<unknown> {
  return runner.run(() => undoStock.execute(new UndoConsumptionCommand(operationId, undoerId)));
}

// Polls the server until `count` sessions wait for a row lock.
async function waitForLockWaiters(count: number): Promise<void> {
  for (let attempt = 0; attempt < 250; attempt += 1) {
    const rows: Array<{ waiting: number }> = await dataSource.query(
      `SELECT count(*)::int AS waiting FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'`,
    );
    if (rows[0].waiting >= count) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`${count} sessions never waited for a row lock`);
}

// Starts every call while a separate transaction holds the lock of the items, and releases the lock
// once each call waits for it. Each call has read the ledger before any of them can write, which is
// the overlap two workers applying the same operation would have.
async function concurrently(
  itemIds: string[],
  ...calls: Array<() => Promise<unknown>>
): Promise<void> {
  const holder = dataSource.createQueryRunner();
  await holder.connect();
  await holder.startTransaction();
  await holder.query(
    `SELECT id FROM inventory_items WHERE external_id = ANY($1::uuid[]) FOR UPDATE`,
    [itemIds],
  );
  try {
    const running = calls.map((call) => call());
    await waitForLockWaiters(calls.length);
    await holder.commitTransaction();
    await Promise.all(running);
  } finally {
    await holder.release();
  }
}

async function quantityOf(itemId: string): Promise<number> {
  const rows: Array<{ quantity_on_hand: number }> = await dataSource.query(
    `SELECT quantity_on_hand FROM inventory_items WHERE external_id = $1`,
    [itemId],
  );
  return rows[0].quantity_on_hand;
}

interface MovementRow {
  kind: string;
  quantity: number;
  status: string | null;
  operation_id: string | null;
}

function movementsOf(itemId: string): Promise<MovementRow[]> {
  return dataSource.query(
    `SELECT sm.kind, sm.quantity, sm.status, sm.operation_id
       FROM stock_movements sm
       JOIN inventory_items ii ON ii.id = sm.inventory_item_id
      WHERE ii.external_id = $1
      ORDER BY sm.id`,
    [itemId],
  );
}

describe('stock operations applied once', () => {
  it('should tag the consumptions of a withdrawal with its operation id and leave the inbound movement untagged', async () => {
    const itemId = await buildStockedItem(10);
    const operationId = randomUUID();

    await withdraw(operationId, await insertWorkOrder(), [
      { inventoryItemId: itemId, quantity: 3 },
    ]);

    expect((await movementsOf(itemId)).map((row) => [row.kind, row.operation_id])).toEqual([
      ['INBOUND', null],
      ['CONSUMPTION', operationId],
    ]);
  });

  it('should leave every stock level as it was before the consumption, and list the returns in the movement history linked to the work order', async () => {
    const itemA = await buildStockedItem(10);
    const itemB = await buildStockedItem(6);
    const workOrderId = await insertWorkOrder();
    const operationId = randomUUID();
    await withdraw(operationId, workOrderId, [
      { inventoryItemId: itemA, quantity: 3 },
      { inventoryItemId: itemB, quantity: 2 },
    ]);
    expect([await quantityOf(itemA), await quantityOf(itemB)]).toEqual([7, 4]);

    await undo(operationId);

    expect([await quantityOf(itemA), await quantityOf(itemB)]).toEqual([10, 6]);
    const history = await queryAdapter.listMovements(itemA);
    expect(
      history.map((movement) => [movement.kind, movement.quantity, movement.workOrderId]),
    ).toEqual([
      ['INBOUND', 10, null],
      ['CONSUMPTION', 3, workOrderId],
      ['RETURN', 3, workOrderId],
    ]);
    const [, consumption, returned] = history;
    expect(returned.undoesMovementId).toBe(consumption.id);
    expect(returned.actorUserId).toBe(undoerId);
    expect(consumption.status).toBe('PENDING');
    expect((await movementsOf(itemA)).map((row) => [row.kind, row.operation_id])).toEqual([
      ['INBOUND', null],
      ['CONSUMPTION', operationId],
      ['RETURN', operationId],
    ]);
  });

  it('should change nothing on a second undo of the same operation', async () => {
    const itemId = await buildStockedItem(10);
    const operationId = randomUUID();
    await withdraw(operationId, await insertWorkOrder(), [
      { inventoryItemId: itemId, quantity: 3 },
    ]);
    await undo(operationId);
    const ledgerAfterFirst = await movementsOf(itemId);

    await undo(operationId);

    expect(await quantityOf(itemId)).toBe(10);
    expect(await movementsOf(itemId)).toEqual(ledgerAfterFirst);
  });

  it('should change nothing on a second restore carrying the same operation id', async () => {
    const itemId = await buildStockedItem(10);
    const workOrderId = await insertWorkOrder();
    await withdraw(randomUUID(), workOrderId, [{ inventoryItemId: itemId, quantity: 3 }]);
    const returnId = randomUUID();
    const lines = [{ inventoryItemId: itemId, quantity: 1 }];
    await returnParts(returnId, workOrderId, lines);
    const ledgerAfterFirst = await movementsOf(itemId);

    await returnParts(returnId, workOrderId, lines);

    expect(await quantityOf(itemId)).toBe(8);
    expect(await movementsOf(itemId)).toEqual(ledgerAfterFirst);
  });

  it('should apply a second restore that carries another operation id', async () => {
    const itemId = await buildStockedItem(10);
    const workOrderId = await insertWorkOrder();
    await withdraw(randomUUID(), workOrderId, [{ inventoryItemId: itemId, quantity: 3 }]);
    const lines = [{ inventoryItemId: itemId, quantity: 1 }];

    await returnParts(randomUUID(), workOrderId, lines);
    await returnParts(randomUUID(), workOrderId, lines);

    expect(await quantityOf(itemId)).toBe(9);
  });

  it('should return the units once when two undos of one operation run at the same time', async () => {
    const itemId = await buildStockedItem(10);
    const operationId = randomUUID();
    await withdraw(operationId, await insertWorkOrder(), [
      { inventoryItemId: itemId, quantity: 3 },
    ]);

    await concurrently(
      [itemId],
      () => undo(operationId),
      () => undo(operationId),
    );

    expect(await quantityOf(itemId)).toBe(10);
    expect((await movementsOf(itemId)).filter((row) => row.kind === 'RETURN')).toHaveLength(1);
  });

  it('should apply a restore once when two restores with one operation id run at the same time', async () => {
    const itemId = await buildStockedItem(10);
    const workOrderId = await insertWorkOrder();
    await withdraw(randomUUID(), workOrderId, [{ inventoryItemId: itemId, quantity: 3 }]);
    const returnId = randomUUID();
    const lines = [{ inventoryItemId: itemId, quantity: 2 }];

    await concurrently(
      [itemId],
      () => returnParts(returnId, workOrderId, lines),
      () => returnParts(returnId, workOrderId, lines),
    );

    expect(await quantityOf(itemId)).toBe(9);
    expect((await movementsOf(itemId)).filter((row) => row.kind === 'RETURN')).toHaveLength(1);
  });

  it('should change nothing for an undo of an operation that consumed nothing', async () => {
    const itemId = await buildStockedItem(10);
    await withdraw(randomUUID(), await insertWorkOrder(), [
      { inventoryItemId: itemId, quantity: 3 },
    ]);
    const ledgerBefore = await movementsOf(itemId);

    await undo(randomUUID());

    expect(await quantityOf(itemId)).toBe(7);
    expect(await movementsOf(itemId)).toEqual(ledgerBefore);
  });

  it('should return only the units left on a consumption after an earlier return', async () => {
    const itemId = await buildStockedItem(10);
    const workOrderId = await insertWorkOrder();
    const operationId = randomUUID();
    await withdraw(operationId, workOrderId, [{ inventoryItemId: itemId, quantity: 3 }]);
    await returnParts(randomUUID(), workOrderId, [{ inventoryItemId: itemId, quantity: 1 }]);

    await undo(operationId);

    expect(await quantityOf(itemId)).toBe(10);
    expect(
      (await movementsOf(itemId))
        .filter((row) => row.kind === 'RETURN' && row.operation_id === operationId)
        .map((row) => row.quantity),
    ).toEqual([2]);
  });

  it('should leave the consumptions of another operation on the same work order alone', async () => {
    const itemId = await buildStockedItem(10);
    const workOrderId = await insertWorkOrder();
    const undone = randomUUID();
    const kept = randomUUID();
    await withdraw(undone, workOrderId, [{ inventoryItemId: itemId, quantity: 2 }]);
    await withdraw(kept, workOrderId, [{ inventoryItemId: itemId, quantity: 1 }]);

    await undo(undone);

    expect(await quantityOf(itemId)).toBe(9);
    expect(await repository.findPendingConsumptionsOfOperation(kept)).toMatchObject([
      { inventoryItemId: itemId, workOrderId, quantity: 1 },
    ]);
    expect(await repository.findPendingConsumptionsOfOperation(undone)).toEqual([]);
  });

  it('should not return the units of a consumption that was settled', async () => {
    const itemId = await buildStockedItem(10);
    const workOrderId = await insertWorkOrder();
    const operationId = randomUUID();
    await withdraw(operationId, workOrderId, [{ inventoryItemId: itemId, quantity: 3 }]);
    await runner.run(() =>
      settleStock.execute(new SettleStockMovementsCommand(workOrderId, withdrawerId)),
    );

    await undo(operationId);

    expect(await quantityOf(itemId)).toBe(7);
    expect((await movementsOf(itemId)).filter((row) => row.kind === 'RETURN')).toEqual([]);
  });
});
