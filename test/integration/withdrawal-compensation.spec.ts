import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { ConcurrentModificationError } from '../../src/shared/application/errors/concurrent-modification.error';
import { Clock } from '../../src/shared/application/ports/clock.port';
import { IdGenerator } from '../../src/shared/application/ports/id-generator.port';
import { TransactionRunner } from '../../src/shared/application/ports/transaction-runner.port';
import { Money } from '../../src/shared/domain/value-objects/money';
import { currentEntityManager } from '../../src/shared/infrastructure/database/typeorm-transaction-runner';
import { CLOCK, TRANSACTION_RUNNER } from '../../src/shared/shared.tokens';
import { InventoryItemRepository } from '../../src/modules/inventory/application/ports/inventory-item.repository';
import { InventoryQueryPort } from '../../src/modules/inventory/application/ports/inventory-query.port';
import { InventoryItem } from '../../src/modules/inventory/domain/entities/inventory-item';
import { InsufficientStockError } from '../../src/modules/inventory/domain/errors/insufficient-stock.error';
import { InventoryItemKind } from '../../src/modules/inventory/domain/inventory-item-kind';
import { InventoryItemId } from '../../src/modules/inventory/domain/value-objects/inventory-item-id';
import { Sku } from '../../src/modules/inventory/domain/value-objects/sku';
import { StockMovementId } from '../../src/modules/inventory/domain/value-objects/stock-movement-id';
import {
  INVENTORY_ITEM_REPOSITORY,
  INVENTORY_QUERY_PORT,
} from '../../src/modules/inventory/inventory.tokens';
import { WithdrawPartsCommand } from '../../src/modules/work-orders/application/commands/withdraw-parts/withdraw-parts.command';
import { WithdrawPartsUseCase } from '../../src/modules/work-orders/application/commands/withdraw-parts/withdraw-parts.use-case';
import { OutboxSettings } from '../../src/modules/work-orders/application/outbox-settings';
import {
  PendingStockSteps,
  StockStepKind,
} from '../../src/modules/work-orders/application/ports/pending-stock-steps.port';
import { StockLedger } from '../../src/modules/work-orders/application/ports/stock-ledger.port';
import { WorkOrderRepository } from '../../src/modules/work-orders/application/ports/work-order.repository';
import { BudgetStatus } from '../../src/modules/work-orders/domain/budget-status';
import { Budget } from '../../src/modules/work-orders/domain/entities/budget';
import { WorkOrder } from '../../src/modules/work-orders/domain/entities/work-order';
import { WorkOrderPartItem } from '../../src/modules/work-orders/domain/entities/work-order-part-item';
import { BudgetId } from '../../src/modules/work-orders/domain/value-objects/budget-id';
import { PlannedQuantity } from '../../src/modules/work-orders/domain/value-objects/planned-quantity';
import { WorkOrderId } from '../../src/modules/work-orders/domain/value-objects/work-order-id';
import { WorkOrderItemId } from '../../src/modules/work-orders/domain/value-objects/work-order-item-id';
import { WorkOrderNumber } from '../../src/modules/work-orders/domain/value-objects/work-order-number';
import { WorkOrderStatus } from '../../src/modules/work-orders/domain/work-order-status';
import {
  OUTBOX_SETTINGS,
  PENDING_STOCK_STEPS,
  STOCK_LEDGER,
} from '../../src/modules/work-orders/work-orders.tokens';
import { uniqueSku } from '../support/factories/sku.factory';
import { uniqueWorkOrderNumber } from '../support/factories/work-order-number.factory';
import { RecordingDomainEventPublisher } from '../support/fakes/recording-domain-event-publisher';
import { createTestApp, TestApp } from '../support/app';
import { drainStockSteps } from '../support/outbox';

// The withdrawal on the real adapters: the outbox, the ledger into inventory, the transaction
// runner and a database. Only the work order repository is a stand-in, because the work order the
// use case loads is built in memory and its row exists for the step to point at.
const NUMBER = 'A1B090-2026';
const PLANNED = 3;
const SHELF = 10;

let testApp: TestApp;
let dataSource: DataSource;
let steps: PendingStockSteps;
let ledger: StockLedger;
let items: InventoryItemRepository;
let inventoryQuery: InventoryQueryPort;
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
  inventoryQuery = testApp.app.get<InventoryQueryPort>(INVENTORY_QUERY_PORT);
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
// `ux_customers_user_id`. The step of a withdrawal points at this row.
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

interface Scenario {
  workOrderId: string;
  itemId: string;
  partItemId: string;
  workOrder: WorkOrder;
}

// The work order the use case loads: in execution, with one part approved on round 1 and nothing
// withdrawn, pointing at the stocked item and at the row `insertWorkOrder` made.
async function scenario(stock = SHELF): Promise<Scenario> {
  const itemId = await buildStockedItem(stock);
  const workOrderId = await insertWorkOrder();
  const partItemId = randomUUID();
  const decidedAt = new Date();
  const budget = Budget.restore({
    id: BudgetId.create(randomUUID()),
    round: 1,
    total: Money.fromCents(7500),
    status: BudgetStatus.Approved,
    generatedAt: decidedAt,
    decidedAt,
    decidedByUserId: actorId,
  });
  const workOrder = WorkOrder.restore({
    id: WorkOrderId.create(workOrderId),
    number: WorkOrderNumber.create(NUMBER),
    customerId: randomUUID(),
    vehicleId: randomUUID(),
    assignedMechanicUserId: actorId,
    createdByUserId: actorId,
    status: WorkOrderStatus.InExecution,
    customerName: 'Jane Doe',
    vehiclePlate: 'ABC1234',
    vehicleBrand: 'Toyota',
    vehicleModel: 'Corolla',
    vehicleYear: 2020,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    serviceItems: [],
    partItems: [
      WorkOrderPartItem.restore({
        id: WorkOrderItemId.create(partItemId),
        inventoryItemId: itemId,
        sku: 'FLT-001',
        itemName: 'Filtro de oleo',
        unitPrice: Money.fromCents(2500),
        plannedQuantity: PlannedQuantity.create(PLANNED),
        withdrawnQuantity: 0,
        budgetRound: 1,
        budgetedUnitPrice: Money.fromCents(2500),
      }),
    ],
    diagnosisStartedAt: decidedAt,
    diagnosisCompletedAt: decidedAt,
    budgets: [budget],
    budgetDecidedAt: decidedAt,
    budgetDecidedByUserId: actorId,
    executionStartedAt: decidedAt,
  });
  return { workOrderId, itemId, partItemId, workOrder };
}

/** Hands the use case the work order it loads, and records the saves it asks for. */
class StubWorkOrders implements WorkOrderRepository {
  readonly saved: Array<{ workOrder: WorkOrder; insideTransaction: boolean }> = [];
  saveFailure: Error | null = null;

  constructor(private readonly workOrder: WorkOrder) {}

  findByNumber(): Promise<WorkOrder | null> {
    return Promise.resolve(this.workOrder);
  }

  save(workOrder: WorkOrder): Promise<void> {
    if (this.saveFailure) {
      return Promise.reject(this.saveFailure);
    }
    this.saved.push({ workOrder, insideTransaction: currentEntityManager() !== undefined });
    return Promise.resolve();
  }
}

interface LedgerHooks {
  /** Runs once the consumption has committed, as the processor would if its grace period ran out. */
  afterConsume?: (operationId: string) => Promise<void>;
  undoFailure?: Error;
}

/** The real ledger, with the hooks a scenario needs between its calls. */
function ledgerWith(hooks: LedgerHooks): StockLedger {
  return {
    consume: async (workOrderId, lines, actorUserId, operationId) => {
      await ledger.consume(workOrderId, lines, actorUserId, operationId);
      await hooks.afterConsume?.(operationId);
    },
    restore: (workOrderId, lines, actorUserId, operationId) =>
      ledger.restore(workOrderId, lines, actorUserId, operationId),
    undoConsumption: (operationId, actorUserId) =>
      hooks.undoFailure
        ? Promise.reject(hooks.undoFailure)
        : ledger.undoConsumption(operationId, actorUserId),
    settle: (workOrderId, actorUserId) => ledger.settle(workOrderId, actorUserId),
    writeOff: (workOrderId, actorUserId) => ledger.writeOff(workOrderId, actorUserId),
  };
}

function withdrawal(fixture: Scenario, hooks: LedgerHooks = {}) {
  const operationId = randomUUID();
  const workOrders = new StubWorkOrders(fixture.workOrder);
  const events = new RecordingDomainEventPublisher();
  const idGenerator: IdGenerator = { generate: () => operationId };
  const useCase = new WithdrawPartsUseCase(
    workOrders,
    transactionRunner,
    idGenerator,
    clock,
    ledgerWith(hooks),
    steps,
    settings,
    events,
  );
  const command = (quantity: number) =>
    new WithdrawPartsCommand(NUMBER, [{ itemId: fixture.partItemId, quantity }], actorId);
  return { useCase, command, workOrders, events, operationId };
}

async function quantityOf(itemId: string): Promise<number> {
  const rows: Array<{ quantity_on_hand: number }> = await dataSource.query(
    `SELECT quantity_on_hand FROM inventory_items WHERE external_id = $1`,
    [itemId],
  );
  return rows[0].quantity_on_hand;
}

interface StepRow {
  status: string;
  attempts: number;
  due_at: Date;
  completed_at: Date | null;
}

async function stepOf(operationId: string): Promise<StepRow> {
  const rows: StepRow[] = await dataSource.query(
    `SELECT status, attempts, due_at, completed_at FROM work_order_stock_steps WHERE operation_id = $1`,
    [operationId],
  );
  return rows[0];
}

async function historyOf(itemId: string): Promise<Array<[string, number, string | null]>> {
  const movements = await inventoryQuery.listMovements(itemId);
  return movements.map((movement) => [movement.kind, movement.quantity, movement.workOrderId]);
}

describe('a withdrawal on the real adapters', () => {
  describe('when the process stops after the consumption', () => {
    it('returns every unit once the processor runs past the grace period, and not before', async () => {
      const { workOrderId, itemId } = await scenario();
      const operationId = randomUUID();
      const dueAt = new Date(Date.now() + settings.graceSeconds * 1000);
      await steps.arm(
        { operationId, kind: StockStepKind.UndoConsumption, workOrderId, actorUserId: actorId },
        dueAt,
      );
      await ledger.consume(
        workOrderId,
        [{ inventoryItemId: itemId, quantity: PLANNED }],
        actorId,
        operationId,
      );
      // The process stops here: the step is never disarmed and the work order is never saved.
      expect(await quantityOf(itemId)).toBe(SHELF - PLANNED);

      await drainStockSteps(testApp.app, [operationId]);

      expect(await quantityOf(itemId)).toBe(SHELF - PLANNED);
      expect((await stepOf(operationId)).status).toBe('ARMED');

      await drainStockSteps(testApp.app, [operationId], new Date(dueAt.getTime() + 1000));

      expect(await quantityOf(itemId)).toBe(SHELF);
      expect(await stepOf(operationId)).toMatchObject({ status: 'DONE', attempts: 1 });
      const history = await inventoryQuery.listMovements(itemId);
      expect(history.map((movement) => [movement.kind, movement.quantity])).toEqual([
        ['INBOUND', SHELF],
        ['CONSUMPTION', PLANNED],
        ['RETURN', PLANNED],
      ]);
      expect(history.map((movement) => movement.workOrderId)).toEqual([
        null,
        workOrderId,
        workOrderId,
      ]);
      expect(history[2].undoesMovementId).toBe(history[1].id);
    });
  });

  describe('when it succeeds', () => {
    it('consumes the stock, saves the work order in the transaction that disarmed the step and leaves the step done', async () => {
      const fixture = await scenario();
      const { useCase, command, workOrders, events, operationId } = withdrawal(fixture);

      await useCase.execute(command(2));

      expect(await quantityOf(fixture.itemId)).toBe(SHELF - 2);
      expect(await stepOf(operationId)).toMatchObject({ status: 'DONE', attempts: 0 });
      expect(workOrders.saved).toHaveLength(1);
      expect(workOrders.saved[0].insideTransaction).toBe(true);
      expect(events.published).toHaveLength(1);
      expect(await historyOf(fixture.itemId)).toEqual([
        ['INBOUND', SHELF, null],
        ['CONSUMPTION', 2, fixture.workOrderId],
      ]);
    });
  });

  describe('when the work order save fails after the consumption', () => {
    it('returns the units, records the return in the movement history and answers the error of the save', async () => {
      const fixture = await scenario();
      const { useCase, command, workOrders, events, operationId } = withdrawal(fixture);
      const saveFailure = new Error('the save failed');
      workOrders.saveFailure = saveFailure;

      await expect(useCase.execute(command(2))).rejects.toBe(saveFailure);

      expect(await quantityOf(fixture.itemId)).toBe(SHELF);
      expect(await stepOf(operationId)).toMatchObject({ status: 'DONE' });
      expect(await historyOf(fixture.itemId)).toEqual([
        ['INBOUND', SHELF, null],
        ['CONSUMPTION', 2, fixture.workOrderId],
        ['RETURN', 2, fixture.workOrderId],
      ]);
      expect(events.published).toHaveLength(0);
    });

    it('hands the step to the processor when the undo fails too, answers the first error, and the processor then returns the units', async () => {
      const fixture = await scenario();
      const undoFailure = new Error('inventory is down');
      const { useCase, command, workOrders, operationId } = withdrawal(fixture, { undoFailure });
      const saveFailure = new Error('the save failed');
      workOrders.saveFailure = saveFailure;

      await expect(useCase.execute(command(2))).rejects.toBe(saveFailure);

      expect(await quantityOf(fixture.itemId)).toBe(SHELF - 2);
      const handedOver = await stepOf(operationId);
      expect(handedOver.status).toBe('PENDING');
      expect(handedOver.due_at.getTime()).toBeLessThanOrEqual(Date.now());

      await drainStockSteps(testApp.app, [operationId]);

      expect(await quantityOf(fixture.itemId)).toBe(SHELF);
      expect((await stepOf(operationId)).status).toBe('DONE');
    });
  });

  describe('when the processor claimed the armed step before the last step', () => {
    it('answers 409 CONCURRENT_MODIFICATION, saves nothing and still returns the units', async () => {
      const fixture = await scenario();
      const claimAfterConsume = async (operationId: string): Promise<void> => {
        const claimed = await steps.claimDue(
          new Date(Date.now() + settings.graceSeconds * 1000 + 1000),
          10,
          new Date(Date.now() + 2 * settings.graceSeconds * 1000),
          [operationId],
        );
        expect(claimed).toHaveLength(1);
      };
      const { useCase, command, workOrders, events, operationId } = withdrawal(fixture, {
        afterConsume: claimAfterConsume,
      });

      const failure = await useCase.execute(command(2)).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(ConcurrentModificationError);
      expect((failure as ConcurrentModificationError).code).toBe('CONCURRENT_MODIFICATION');
      expect(workOrders.saved).toHaveLength(0);
      expect(events.published).toHaveLength(0);
      expect(await quantityOf(fixture.itemId)).toBe(SHELF);
      expect(await stepOf(operationId)).toMatchObject({ status: 'DONE', attempts: 1 });
      expect(await historyOf(fixture.itemId)).toEqual([
        ['INBOUND', SHELF, null],
        ['CONSUMPTION', 2, fixture.workOrderId],
        ['RETURN', 2, fixture.workOrderId],
      ]);
    });
  });

  describe('when the stock falls short', () => {
    it('answers the shortage, changes no stock level and leaves the work order unsaved', async () => {
      const fixture = await scenario(2);
      const { useCase, command, workOrders, operationId } = withdrawal(fixture);

      await expect(useCase.execute(command(PLANNED))).rejects.toBeInstanceOf(
        InsufficientStockError,
      );

      expect(await quantityOf(fixture.itemId)).toBe(2);
      expect(workOrders.saved).toHaveLength(0);
      expect(await stepOf(operationId)).toMatchObject({ status: 'DONE' });
      expect(await historyOf(fixture.itemId)).toEqual([['INBOUND', 2, null]]);
    });
  });
});
