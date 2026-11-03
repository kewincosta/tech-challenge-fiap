import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { Clock } from '../../src/shared/application/ports/clock.port';
import { TransactionRunner } from '../../src/shared/application/ports/transaction-runner.port';
import { Money } from '../../src/shared/domain/value-objects/money';
import { CLOCK, TRANSACTION_RUNNER } from '../../src/shared/shared.tokens';
import { InventoryItemRepository } from '../../src/modules/inventory/application/ports/inventory-item.repository';
import { InventoryItem } from '../../src/modules/inventory/domain/entities/inventory-item';
import { InventoryItemKind } from '../../src/modules/inventory/domain/inventory-item-kind';
import { InventoryItemId } from '../../src/modules/inventory/domain/value-objects/inventory-item-id';
import { Sku } from '../../src/modules/inventory/domain/value-objects/sku';
import { StockMovementId } from '../../src/modules/inventory/domain/value-objects/stock-movement-id';
import { INVENTORY_ITEM_REPOSITORY } from '../../src/modules/inventory/inventory.tokens';
import { OutboxSettings } from '../../src/modules/work-orders/application/outbox-settings';
import {
  PendingStockSteps,
  StockStep,
  StockStepKind,
} from '../../src/modules/work-orders/application/ports/pending-stock-steps.port';
import { StockLedger } from '../../src/modules/work-orders/application/ports/stock-ledger.port';
import { StockStepApplier } from '../../src/modules/work-orders/application/services/stock-step-applier';
import {
  OUTBOX_SETTINGS,
  PENDING_STOCK_STEPS,
  STOCK_LEDGER,
} from '../../src/modules/work-orders/work-orders.tokens';
import { uniqueSku } from '../support/factories/sku.factory';
import { uniqueWorkOrderNumber } from '../support/factories/work-order-number.factory';
import { RecordingStockStepLog } from '../support/fakes/recording-stock-step-log';
import { createTestApp, TestApp } from '../support/app';
import { drainStockSteps, drainStockStepsOfWorkOrder } from '../support/outbox';

// A return, a delivery and a cancellation record their step with the save and apply it after the
// commit. This spec starts at the recorded step: the request's own attempt meets an inventory that
// fails once, and the processor, run past the wait the failure set, applies the step to a real
// database. It also follows a return whose restore failed through the cancellation or the delivery
// that comes next: the steps of a work order apply in the order they were recorded.
const SHELF = 10;
const WITHDRAWN = 3;
const RETURNED = 2;

let testApp: TestApp;
let dataSource: DataSource;
let steps: PendingStockSteps;
let ledger: StockLedger;
let items: InventoryItemRepository;
let transactionRunner: TransactionRunner;
let clock: Clock;
let settings: OutboxSettings;
let actorId: string;
const madeWorkOrders: string[] = [];

beforeAll(async () => {
  testApp = await createTestApp();
  dataSource = testApp.dataSource;
  steps = testApp.app.get<PendingStockSteps>(PENDING_STOCK_STEPS);
  ledger = testApp.app.get<StockLedger>(STOCK_LEDGER);
  items = testApp.app.get<InventoryItemRepository>(INVENTORY_ITEM_REPOSITORY);
  transactionRunner = testApp.app.get<TransactionRunner>(TRANSACTION_RUNNER);
  clock = testApp.app.get<Clock>(CLOCK);
  settings = testApp.app.get<OutboxSettings>(OUTBOX_SETTINGS);
  actorId = await insertUser();
});

afterEach(async () => {
  await dataSource.query(
    `DELETE FROM work_order_stock_steps
      WHERE work_order_id IN (SELECT id FROM work_orders WHERE external_id = ANY($1::uuid[]))`,
    [madeWorkOrders.splice(0)],
  );
});

afterAll(async () => {
  await testApp.close();
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

// A work order row over its own freshly created user, customer and vehicle: a dedicated user avoids
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
      uniqueWorkOrderNumber(),
      customerRows[0].id,
      vehicleRows[0].id,
      userRows[0].id,
    ],
  );
  madeWorkOrders.push(workOrderExternalId);
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
  await items.save(item);
  return item.id.value;
}

// A withdrawal that reached its work order: a restore, a settlement and a write-off read only the
// consumptions that are confirmed.
async function withdrawConfirmed(workOrderId: string, itemId: string): Promise<void> {
  const operationId = randomUUID();
  await ledger.consume(
    workOrderId,
    [{ inventoryItemId: itemId, quantity: WITHDRAWN }],
    actorId,
    operationId,
  );
  await ledger.confirmConsumption(operationId, actorId);
}

type LedgerCall = 'restore' | 'settle' | 'writeOff';

/** The real ledger, whose first `call` fails the way an inventory that is busy would. */
function ledgerFailingOnce(call: LedgerCall): StockLedger {
  let failed = false;
  const unlessFirst = <T>(name: LedgerCall, run: () => Promise<T>): Promise<T> => {
    if (name === call && !failed) {
      failed = true;
      return Promise.reject(new Error('inventory is busy'));
    }
    return run();
  };
  return {
    consume: (workOrderId, lines, actorUserId, operationId) =>
      ledger.consume(workOrderId, lines, actorUserId, operationId),
    restore: (workOrderId, lines, actorUserId, operationId) =>
      unlessFirst('restore', () => ledger.restore(workOrderId, lines, actorUserId, operationId)),
    undoConsumption: (operationId, actorUserId) => ledger.undoConsumption(operationId, actorUserId),
    confirmConsumption: (operationId, actorUserId) =>
      ledger.confirmConsumption(operationId, actorUserId),
    settle: (workOrderId, actorUserId) =>
      unlessFirst('settle', () => ledger.settle(workOrderId, actorUserId)),
    writeOff: (workOrderId, actorUserId) =>
      unlessFirst('writeOff', () => ledger.writeOff(workOrderId, actorUserId)),
  };
}

interface StepRow {
  status: string;
  attempts: number;
  last_error: string | null;
  due_at: Date;
}

async function stepOf(operationId: string): Promise<StepRow> {
  const rows: StepRow[] = await dataSource.query(
    `SELECT status, attempts, last_error, due_at FROM work_order_stock_steps WHERE operation_id = $1`,
    [operationId],
  );
  return rows[0];
}

async function quantityOf(itemId: string): Promise<number> {
  const rows: Array<{ quantity_on_hand: number }> = await dataSource.query(
    `SELECT quantity_on_hand FROM inventory_items WHERE external_id = $1`,
    [itemId],
  );
  return rows[0].quantity_on_hand;
}

async function ledgerOf(itemId: string): Promise<Array<[string, number, string | null]>> {
  const rows: Array<{ kind: string; quantity: number; status: string | null }> =
    await dataSource.query(
      `SELECT sm.kind, sm.quantity, sm.status
         FROM stock_movements sm
         JOIN inventory_items ii ON ii.id = sm.inventory_item_id
        WHERE ii.external_id = $1
        ORDER BY sm.id`,
      [itemId],
    );
  return rows.map((row) => [row.kind, row.quantity, row.status]);
}

async function transitionsOf(itemId: string): Promise<Array<[string, number | null]>> {
  const rows: Array<{ to_status: string; quantity: number | null }> = await dataSource.query(
    `SELECT t.to_status, t.quantity
       FROM stock_movement_transitions t
       JOIN stock_movements sm ON sm.id = t.stock_movement_id
       JOIN inventory_items ii ON ii.id = sm.inventory_item_id
      WHERE ii.external_id = $1`,
    [itemId],
  );
  return rows.map((row) => [row.to_status, row.quantity]);
}

interface Scenario {
  kind: StockStepKind;
  call: LedgerCall;
  lines?: Array<{ inventoryItemId: string; quantity: number }>;
  /** What the stock looks like once the step is applied, exactly once. */
  expectApplied: (itemId: string) => Promise<void>;
  /** What the stock looks like while the step is pending. */
  expectUntouched: (itemId: string) => Promise<void>;
}

const SCENARIOS: Array<[string, (itemId: string) => Scenario]> = [
  [
    'a return restores',
    (itemId) => ({
      kind: StockStepKind.Restore,
      call: 'restore',
      lines: [{ inventoryItemId: itemId, quantity: RETURNED }],
      expectUntouched: async () => {
        expect(await quantityOf(itemId)).toBe(SHELF - WITHDRAWN);
        expect(await ledgerOf(itemId)).toEqual([
          ['INBOUND', SHELF, null],
          ['CONSUMPTION', WITHDRAWN, 'PENDING'],
        ]);
      },
      expectApplied: async () => {
        expect(await quantityOf(itemId)).toBe(SHELF - WITHDRAWN + RETURNED);
        expect(await ledgerOf(itemId)).toEqual([
          ['INBOUND', SHELF, null],
          ['CONSUMPTION', WITHDRAWN, 'PENDING'],
          ['RETURN', RETURNED, null],
        ]);
      },
    }),
  ],
  [
    'a delivery settles',
    (itemId) => ({
      kind: StockStepKind.Settle,
      call: 'settle',
      expectUntouched: async () => {
        expect(await ledgerOf(itemId)).toEqual([
          ['INBOUND', SHELF, null],
          ['CONSUMPTION', WITHDRAWN, 'PENDING'],
        ]);
        expect(await transitionsOf(itemId)).toEqual([]);
      },
      expectApplied: async () => {
        expect(await quantityOf(itemId)).toBe(SHELF - WITHDRAWN);
        expect(await ledgerOf(itemId)).toEqual([
          ['INBOUND', SHELF, null],
          ['CONSUMPTION', WITHDRAWN, 'SETTLED'],
        ]);
        expect(await transitionsOf(itemId)).toEqual([['SETTLED', null]]);
      },
    }),
  ],
  [
    'a cancellation writes off',
    (itemId) => ({
      kind: StockStepKind.WriteOff,
      call: 'writeOff',
      expectUntouched: async () => {
        expect(await ledgerOf(itemId)).toEqual([
          ['INBOUND', SHELF, null],
          ['CONSUMPTION', WITHDRAWN, 'PENDING'],
        ]);
        expect(await transitionsOf(itemId)).toEqual([]);
      },
      expectApplied: async () => {
        expect(await quantityOf(itemId)).toBe(SHELF - WITHDRAWN);
        expect(await ledgerOf(itemId)).toEqual([
          ['INBOUND', SHELF, null],
          ['CONSUMPTION', WITHDRAWN, 'WRITTEN_OFF'],
        ]);
        expect(await transitionsOf(itemId)).toEqual([['WRITTEN_OFF', WITHDRAWN]]);
      },
    }),
  ],
];

describe('a stock step whose first attempt meets an inventory that fails', () => {
  it.each(SCENARIOS)(
    'applies the step once the processor runs past the wait, so that %s the stock exactly once',
    async (_name, scenarioOf) => {
      const itemId = await buildStockedItem(SHELF);
      const workOrderId = await insertWorkOrder();
      await withdrawConfirmed(workOrderId, itemId);
      const scenario = scenarioOf(itemId);
      const step: StockStep = {
        operationId: randomUUID(),
        kind: scenario.kind,
        workOrderId,
        actorUserId: actorId,
        lines: scenario.lines,
      };
      // The step is recorded the way the use case records it, in a transaction of its own.
      await transactionRunner.run(() => steps.enqueue(step));
      const requestApplier = new StockStepApplier(
        steps,
        ledgerFailingOnce(scenario.call),
        clock,
        new RecordingStockStepLog(),
        settings,
      );

      // The request's own attempt fails, and the request is none the wiser.
      await expect(requestApplier.applyAfterCommit(step.operationId)).resolves.toBeUndefined();

      const afterFailure = await stepOf(step.operationId);
      expect(afterFailure).toMatchObject({
        status: 'PENDING',
        attempts: 1,
        last_error: 'inventory is busy',
      });
      expect(afterFailure.due_at.getTime()).toBeGreaterThan(Date.now());
      await scenario.expectUntouched(itemId);

      // The processor, past the wait the failure set, applies the step to the real inventory.
      await drainStockSteps(testApp.app, [step.operationId], new Date(Date.now() + 5000));

      expect(await stepOf(step.operationId)).toMatchObject({ status: 'DONE', attempts: 2 });
      await scenario.expectApplied(itemId);

      // A later run finds the step done and changes nothing.
      await drainStockSteps(testApp.app, [step.operationId], new Date(Date.now() + 3_600_000));

      expect(await stepOf(step.operationId)).toMatchObject({ status: 'DONE', attempts: 2 });
      await scenario.expectApplied(itemId);
    },
  );
});

interface ClosingScenario {
  kind: StockStepKind;
  /** What the closing step leaves in the ledger once the restore applied first. */
  expectedLedger: Array<[string, number, string | null]>;
  /** The transitions of the item's consumptions the closing step recorded. */
  expectedTransitions: Array<[string, number | null]>;
}

const CLOSING_SCENARIOS: Array<[string, ClosingScenario]> = [
  [
    'a cancellation writes off only what stayed outstanding',
    {
      kind: StockStepKind.WriteOff,
      expectedLedger: [
        ['INBOUND', SHELF, null],
        ['CONSUMPTION', WITHDRAWN, 'WRITTEN_OFF'],
        ['RETURN', RETURNED, null],
      ],
      expectedTransitions: [['WRITTEN_OFF', WITHDRAWN - RETURNED]],
    },
  ],
  [
    'a delivery settles the consumption the return drew from',
    {
      kind: StockStepKind.Settle,
      expectedLedger: [
        ['INBOUND', SHELF, null],
        ['CONSUMPTION', WITHDRAWN, 'SETTLED'],
        ['RETURN', RETURNED, null],
      ],
      expectedTransitions: [['SETTLED', null]],
    },
  ],
];

describe('a closing step recorded after a restore that failed', () => {
  it.each(CLOSING_SCENARIOS)('waits for the restore, so that %s', async (_name, scenario) => {
    const itemId = await buildStockedItem(SHELF);
    const workOrderId = await insertWorkOrder();
    await withdrawConfirmed(workOrderId, itemId);
    const restore: StockStep = {
      operationId: randomUUID(),
      kind: StockStepKind.Restore,
      workOrderId,
      actorUserId: actorId,
      lines: [{ inventoryItemId: itemId, quantity: RETURNED }],
    };
    const closing: StockStep = {
      operationId: randomUUID(),
      kind: scenario.kind,
      workOrderId,
      actorUserId: actorId,
    };
    const failingRestore = new StockStepApplier(
      steps,
      ledgerFailingOnce('restore'),
      clock,
      new RecordingStockStepLog(),
      settings,
    );
    const closingRequest = new StockStepApplier(
      steps,
      ledger,
      clock,
      new RecordingStockStepLog(),
      settings,
    );

    // The return is saved with its step, and its attempt meets an inventory that fails.
    await transactionRunner.run(() => steps.enqueue(restore));
    await failingRestore.applyAfterCommit(restore.operationId);
    // The cancellation or the delivery is saved with its step, and its attempt follows at once.
    await transactionRunner.run(() => steps.enqueue(closing));
    await closingRequest.applyAfterCommit(closing.operationId);

    expect(await stepOf(restore.operationId)).toMatchObject({
      status: 'PENDING',
      attempts: 1,
      last_error: 'inventory is busy',
    });
    expect(await stepOf(closing.operationId)).toMatchObject({
      status: 'PENDING',
      attempts: 0,
      last_error: null,
    });
    expect(await quantityOf(itemId)).toBe(SHELF - WITHDRAWN);
    expect(await ledgerOf(itemId)).toEqual([
      ['INBOUND', SHELF, null],
      ['CONSUMPTION', WITHDRAWN, 'PENDING'],
    ]);

    // The processor, past the wait the failure set, applies the restore and then the closing step.
    await drainStockStepsOfWorkOrder(testApp.app, workOrderId, new Date(Date.now() + 5000));

    expect(await stepOf(restore.operationId)).toMatchObject({ status: 'DONE', attempts: 2 });
    expect(await stepOf(closing.operationId)).toMatchObject({ status: 'DONE', attempts: 1 });
    expect(await quantityOf(itemId)).toBe(SHELF - WITHDRAWN + RETURNED);
    expect(await ledgerOf(itemId)).toEqual(scenario.expectedLedger);
    expect(await transitionsOf(itemId)).toEqual(scenario.expectedTransitions);
  });
});
