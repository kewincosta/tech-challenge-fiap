import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { Money } from '../../src/shared/domain/value-objects/money';
import { CryptoIdGenerator } from '../../src/shared/infrastructure/ids/crypto-id-generator';
import { TransactionRunner } from '../../src/shared/application/ports/transaction-runner.port';
import { TypeOrmTransactionRunner } from '../../src/shared/infrastructure/database/typeorm-transaction-runner';
import { SystemClock } from '../../src/shared/infrastructure/time/system-clock';
import { ConfirmConsumptionCommand } from '../../src/modules/inventory/application/commands/confirm-consumption/confirm-consumption.command';
import { ConfirmConsumptionUseCase } from '../../src/modules/inventory/application/commands/confirm-consumption/confirm-consumption.use-case';
import { ConsumeStockBatchCommand } from '../../src/modules/inventory/application/commands/consume-stock-batch/consume-stock-batch.command';
import { ConsumeStockBatchUseCase } from '../../src/modules/inventory/application/commands/consume-stock-batch/consume-stock-batch.use-case';
import { RestoreStockBatchCommand } from '../../src/modules/inventory/application/commands/restore-stock-batch/restore-stock-batch.command';
import { RestoreStockBatchUseCase } from '../../src/modules/inventory/application/commands/restore-stock-batch/restore-stock-batch.use-case';
import { SettleStockMovementsCommand } from '../../src/modules/inventory/application/commands/settle-stock-movements/settle-stock-movements.command';
import { SettleStockMovementsUseCase } from '../../src/modules/inventory/application/commands/settle-stock-movements/settle-stock-movements.use-case';
import { WriteOffStockMovementsCommand } from '../../src/modules/inventory/application/commands/write-off-stock-movements/write-off-stock-movements.command';
import { WriteOffStockMovementsUseCase } from '../../src/modules/inventory/application/commands/write-off-stock-movements/write-off-stock-movements.use-case';
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
import { uniqueWorkOrderNumber } from '../support/factories/work-order-number.factory';
import { FakeClock } from '../support/fakes/fake-clock';
import { RecordingDomainEventPublisher } from '../support/fakes/recording-domain-event-publisher';
import { createTestDataSource } from '../support/db';

let dataSource: DataSource;
let repository: TypeOrmInventoryItemRepository;
let queryAdapter: TypeOrmInventoryQueryAdapter;
let runner: TypeOrmTransactionRunner;
let consumeStock: ConsumeStockBatchUseCase;
let restoreStock: RestoreStockBatchUseCase;
let undoStock: UndoConsumptionUseCase;
let confirmStock: ConfirmConsumptionUseCase;
// The confirmation use case reads this clock alone, so a case moves it to tell two confirmations apart.
const confirmClock = new FakeClock(new Date('2030-01-01T00:00:00.000Z'));
let settleStock: SettleStockMovementsUseCase;
let writeOffStock: WriteOffStockMovementsUseCase;
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
  consumeStock = new ConsumeStockBatchUseCase(repository, runner, idGenerator, clock, events);
  restoreStock = new RestoreStockBatchUseCase(repository, runner, idGenerator, clock, events);
  undoStock = new UndoConsumptionUseCase(repository, runner, idGenerator, clock, events);
  confirmStock = new ConfirmConsumptionUseCase(repository, confirmClock);
  settleStock = new SettleStockMovementsUseCase(repository, runner, clock);
  writeOffStock = new WriteOffStockMovementsUseCase(repository, runner, clock);
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
  return consumeStock.execute(
    new ConsumeStockBatchCommand(lines, workOrderId, withdrawerId, operationId),
  );
}

function returnParts(
  operationId: string,
  workOrderId: string,
  lines: Array<{ inventoryItemId: string; quantity: number }>,
): Promise<unknown> {
  return restoreStock.execute(
    new RestoreStockBatchCommand(lines, workOrderId, withdrawerId, operationId),
  );
}

function undo(operationId: string): Promise<unknown> {
  return undoStock.execute(new UndoConsumptionCommand(operationId, undoerId));
}

function confirm(operationId: string): Promise<unknown> {
  return confirmStock.execute(new ConfirmConsumptionCommand(operationId, withdrawerId));
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

async function confirmationsOf(
  itemId: string,
): Promise<Array<[string, string | null, Date | null]>> {
  const rows: Array<{ kind: string; operation_id: string | null; confirmed_at: Date | null }> =
    await dataSource.query(
      `SELECT sm.kind, sm.operation_id, sm.confirmed_at
         FROM stock_movements sm
         JOIN inventory_items ii ON ii.id = sm.inventory_item_id
        WHERE ii.external_id = $1
        ORDER BY sm.id`,
      [itemId],
    );
  return rows.map((row) => [row.kind, row.operation_id, row.confirmed_at]);
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

// A runner whose transaction stays open after the work is done, until `release` is resolved: the
// statements the work ran are applied and uncommitted while the test starts another run.
function holdingRunner(
  reachedEnd: { resolve: () => void },
  release: Promise<void>,
): TransactionRunner {
  return {
    run: (work) =>
      runner.run(async () => {
        const result = await work();
        reachedEnd.resolve();
        await release;
        return result;
      }),
  };
}

function transitionsOf(itemId: string): Promise<Array<{ to_status: string; quantity: number }>> {
  return dataSource.query(
    `SELECT t.to_status, t.quantity
       FROM stock_movement_transitions t
       JOIN stock_movements sm ON sm.id = t.stock_movement_id
       JOIN inventory_items ii ON ii.id = sm.inventory_item_id
      WHERE ii.external_id = $1 AND sm.kind = 'CONSUMPTION'`,
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

  it('should give back the units of a consumption that was settled before the undo', async () => {
    const itemId = await buildStockedItem(10);
    const workOrderId = await insertWorkOrder();
    const operationId = randomUUID();
    await withdraw(operationId, workOrderId, [{ inventoryItemId: itemId, quantity: 3 }]);
    await settleStock.execute(new SettleStockMovementsCommand(workOrderId, withdrawerId));

    await undo(operationId);

    expect(await quantityOf(itemId)).toBe(10);
    expect((await movementsOf(itemId)).map((row) => [row.kind, row.status])).toEqual([
      ['INBOUND', null],
      ['CONSUMPTION', 'SETTLED'],
      ['RETURN', null],
    ]);
  });

  it('should give back the units of a consumption that a write-off closed before the undo', async () => {
    const itemId = await buildStockedItem(10);
    const workOrderId = await insertWorkOrder();
    const operationId = randomUUID();
    await withdraw(operationId, workOrderId, [{ inventoryItemId: itemId, quantity: 3 }]);
    await writeOffStock.execute(new WriteOffStockMovementsCommand(workOrderId, withdrawerId));
    expect(await quantityOf(itemId)).toBe(7);

    await undo(operationId);

    expect(await quantityOf(itemId)).toBe(10);
    expect((await movementsOf(itemId)).map((row) => [row.kind, row.status])).toEqual([
      ['INBOUND', null],
      ['CONSUMPTION', 'WRITTEN_OFF'],
      ['RETURN', null],
    ]);
  });

  it('should record one transition per consumption when two write-offs of a work order interleave: the second reads the consumptions while the first holds its update uncommitted', async () => {
    const itemA = await buildStockedItem(10);
    const itemB = await buildStockedItem(6);
    const workOrderId = await insertWorkOrder();
    await withdraw(randomUUID(), workOrderId, [
      { inventoryItemId: itemA, quantity: 3 },
      { inventoryItemId: itemB, quantity: 2 },
    ]);
    const reachedEnd = deferred();
    const release = deferred();
    const holding = new WriteOffStockMovementsUseCase(
      repository,
      holdingRunner(reachedEnd, release.promise),
      new SystemClock(),
    );
    const command = new WriteOffStockMovementsCommand(workOrderId, withdrawerId);

    const first = holding.execute(command);
    // The first run has updated the rows and recorded its transitions, and keeps them uncommitted.
    await Promise.race([reachedEnd.promise, first]);
    const second = writeOffStock.execute(command);
    // The second run read both consumptions as pending and waits at its update for the row locks.
    await Promise.race([waitForLockWaiters(1), second]);
    release.resolve();
    await Promise.all([first, second]);

    expect(await transitionsOf(itemA)).toEqual([{ to_status: 'WRITTEN_OFF', quantity: 3 }]);
    expect(await transitionsOf(itemB)).toEqual([{ to_status: 'WRITTEN_OFF', quantity: 2 }]);
    expect((await movementsOf(itemA)).map((row) => row.status)).toEqual([null, 'WRITTEN_OFF']);
    expect((await movementsOf(itemB)).map((row) => row.status)).toEqual([null, 'WRITTEN_OFF']);
  });

  it('should record one transition per consumption when two write-offs of a work order run together', async () => {
    const itemId = await buildStockedItem(10);
    const workOrderId = await insertWorkOrder();
    await withdraw(randomUUID(), workOrderId, [{ inventoryItemId: itemId, quantity: 3 }]);
    const command = new WriteOffStockMovementsCommand(workOrderId, withdrawerId);

    await Promise.all([writeOffStock.execute(command), writeOffStock.execute(command)]);

    expect(await transitionsOf(itemId)).toEqual([{ to_status: 'WRITTEN_OFF', quantity: 3 }]);
  });

  it('should record no transition and change no status when a work order is settled a second time, one run after the other', async () => {
    const itemA = await buildStockedItem(10);
    const itemB = await buildStockedItem(6);
    const workOrderId = await insertWorkOrder();
    await withdraw(randomUUID(), workOrderId, [
      { inventoryItemId: itemA, quantity: 3 },
      { inventoryItemId: itemB, quantity: 2 },
    ]);
    const command = new SettleStockMovementsCommand(workOrderId, withdrawerId);
    await settleStock.execute(command);
    const ledgerAfterFirst = [await movementsOf(itemA), await movementsOf(itemB)];

    await settleStock.execute(command);

    expect(await transitionsOf(itemA)).toEqual([{ to_status: 'SETTLED', quantity: null }]);
    expect(await transitionsOf(itemB)).toEqual([{ to_status: 'SETTLED', quantity: null }]);
    expect((await movementsOf(itemA)).map((row) => row.status)).toEqual([null, 'SETTLED']);
    expect((await movementsOf(itemB)).map((row) => row.status)).toEqual([null, 'SETTLED']);
    expect([await movementsOf(itemA), await movementsOf(itemB)]).toEqual(ledgerAfterFirst);
  });

  it('should record one transition per consumption when two settlements of a work order interleave: the second starts while the first holds its update uncommitted', async () => {
    const itemA = await buildStockedItem(10);
    const itemB = await buildStockedItem(6);
    const workOrderId = await insertWorkOrder();
    await withdraw(randomUUID(), workOrderId, [
      { inventoryItemId: itemA, quantity: 3 },
      { inventoryItemId: itemB, quantity: 2 },
    ]);
    const reachedEnd = deferred();
    const release = deferred();
    const holding = new SettleStockMovementsUseCase(
      repository,
      holdingRunner(reachedEnd, release.promise),
      new SystemClock(),
    );
    const command = new SettleStockMovementsCommand(workOrderId, withdrawerId);

    const first = holding.execute(command);
    // The first run has updated the rows and recorded its transitions, and keeps them uncommitted.
    await Promise.race([reachedEnd.promise, first]);
    const second = settleStock.execute(command);
    // The second run met both consumptions pending and waits at its update for the row locks.
    await Promise.race([waitForLockWaiters(1), second]);
    release.resolve();
    await Promise.all([first, second]);

    expect(await transitionsOf(itemA)).toEqual([{ to_status: 'SETTLED', quantity: null }]);
    expect(await transitionsOf(itemB)).toEqual([{ to_status: 'SETTLED', quantity: null }]);
    expect((await movementsOf(itemA)).map((row) => row.status)).toEqual([null, 'SETTLED']);
    expect((await movementsOf(itemB)).map((row) => row.status)).toEqual([null, 'SETTLED']);
  });
});

describe('consumptions confirmed by operation', () => {
  it('should set the time of the clock on every consumption the operation tagged, and leave the other operations, the inbound movements and the returns without one', async () => {
    const itemA = await buildStockedItem(10);
    const itemB = await buildStockedItem(6);
    const workOrderId = await insertWorkOrder();
    const confirmed = randomUUID();
    const other = randomUUID();
    await withdraw(confirmed, workOrderId, [
      { inventoryItemId: itemA, quantity: 3 },
      { inventoryItemId: itemB, quantity: 2 },
    ]);
    await withdraw(other, workOrderId, [{ inventoryItemId: itemA, quantity: 1 }]);
    const confirmedAt = confirmClock.now();

    await confirm(confirmed);

    expect(await confirmationsOf(itemA)).toEqual([
      ['INBOUND', null, null],
      ['CONSUMPTION', confirmed, confirmedAt],
      ['CONSUMPTION', other, null],
    ]);
    expect(await confirmationsOf(itemB)).toEqual([
      ['INBOUND', null, null],
      ['CONSUMPTION', confirmed, confirmedAt],
    ]);
  });

  it('should keep the time of the first confirmation when the operation is confirmed a second time', async () => {
    const itemId = await buildStockedItem(10);
    const operationId = randomUUID();
    await withdraw(operationId, await insertWorkOrder(), [
      { inventoryItemId: itemId, quantity: 3 },
    ]);
    const firstConfirmation = confirmClock.now();
    await confirm(operationId);
    confirmClock.advanceSeconds(60);

    await confirm(operationId);

    expect(await confirmationsOf(itemId)).toEqual([
      ['INBOUND', null, null],
      ['CONSUMPTION', operationId, firstConfirmation],
    ]);
  });

  it('should change nothing for an operation that consumed nothing', async () => {
    const itemId = await buildStockedItem(10);
    await withdraw(randomUUID(), await insertWorkOrder(), [
      { inventoryItemId: itemId, quantity: 3 },
    ]);
    const ledgerBefore = await confirmationsOf(itemId);

    await confirm(randomUUID());

    expect(await confirmationsOf(itemId)).toEqual(ledgerBefore);
  });

  it('should set the time on the consumption alone when an undo tagged its returns with the same operation id', async () => {
    const itemId = await buildStockedItem(10);
    const operationId = randomUUID();
    await withdraw(operationId, await insertWorkOrder(), [
      { inventoryItemId: itemId, quantity: 3 },
    ]);
    await undo(operationId);
    const confirmedAt = confirmClock.now();

    await confirm(operationId);

    expect(await confirmationsOf(itemId)).toEqual([
      ['INBOUND', null, null],
      ['CONSUMPTION', operationId, confirmedAt],
      ['RETURN', operationId, null],
    ]);
  });
});
