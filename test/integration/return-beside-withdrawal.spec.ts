import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { ConcurrentModificationError } from '../../src/shared/application/errors/concurrent-modification.error';
import { Clock } from '../../src/shared/application/ports/clock.port';
import { DomainEventPublisher } from '../../src/shared/application/ports/domain-event-publisher.port';
import { IdGenerator } from '../../src/shared/application/ports/id-generator.port';
import { TransactionRunner } from '../../src/shared/application/ports/transaction-runner.port';
import { Money } from '../../src/shared/domain/value-objects/money';
import {
  CLOCK,
  DOMAIN_EVENT_PUBLISHER,
  ID_GENERATOR,
  TRANSACTION_RUNNER,
} from '../../src/shared/shared.tokens';
import { InventoryItemRepository } from '../../src/modules/inventory/application/ports/inventory-item.repository';
import { InventoryItem } from '../../src/modules/inventory/domain/entities/inventory-item';
import { InventoryItemKind } from '../../src/modules/inventory/domain/inventory-item-kind';
import { InventoryItemId } from '../../src/modules/inventory/domain/value-objects/inventory-item-id';
import { Sku } from '../../src/modules/inventory/domain/value-objects/sku';
import { StockMovementId } from '../../src/modules/inventory/domain/value-objects/stock-movement-id';
import { INVENTORY_ITEM_REPOSITORY } from '../../src/modules/inventory/inventory.tokens';
import { CancelWorkOrderCommand } from '../../src/modules/work-orders/application/commands/cancel-work-order/cancel-work-order.command';
import { CancelWorkOrderUseCase } from '../../src/modules/work-orders/application/commands/cancel-work-order/cancel-work-order.use-case';
import { CompleteWorkOrderCommand } from '../../src/modules/work-orders/application/commands/complete-work-order/complete-work-order.command';
import { CompleteWorkOrderUseCase } from '../../src/modules/work-orders/application/commands/complete-work-order/complete-work-order.use-case';
import { DeliverVehicleCommand } from '../../src/modules/work-orders/application/commands/deliver-vehicle/deliver-vehicle.command';
import { DeliverVehicleUseCase } from '../../src/modules/work-orders/application/commands/deliver-vehicle/deliver-vehicle.use-case';
import { ReturnPartsCommand } from '../../src/modules/work-orders/application/commands/return-parts/return-parts.command';
import { ReturnPartsUseCase } from '../../src/modules/work-orders/application/commands/return-parts/return-parts.use-case';
import { WithdrawPartsCommand } from '../../src/modules/work-orders/application/commands/withdraw-parts/withdraw-parts.command';
import { WithdrawPartsUseCase } from '../../src/modules/work-orders/application/commands/withdraw-parts/withdraw-parts.use-case';
import { OutboxSettings } from '../../src/modules/work-orders/application/outbox-settings';
import { PendingStockSteps } from '../../src/modules/work-orders/application/ports/pending-stock-steps.port';
import { StockLedger } from '../../src/modules/work-orders/application/ports/stock-ledger.port';
import { StockStepLog } from '../../src/modules/work-orders/application/ports/stock-step-log.port';
import { WorkOrderRepository } from '../../src/modules/work-orders/application/ports/work-order.repository';
import { CancellationAuthorizer } from '../../src/modules/work-orders/application/services/cancellation.authorizer';
import { StockStepApplier } from '../../src/modules/work-orders/application/services/stock-step-applier';
import { WorkOrderCompletionAuthorizer } from '../../src/modules/work-orders/application/services/work-order-completion.authorizer';
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
  STOCK_STEP_LOG,
  WORK_ORDER_REPOSITORY,
} from '../../src/modules/work-orders/work-orders.tokens';
import { uniqueSku } from '../support/factories/sku.factory';
import { uniqueWorkOrderNumber } from '../support/factories/work-order-number.factory';
import { FakeWorkOrderActors } from '../support/fakes/fake-work-order-actors';
import { createTestApp, TestApp } from '../support/app';
import { drainStockStepsOfWorkOrder } from '../support/outbox';

// A withdrawal consumes the stock before it saves the work order, so for a while its consumption
// sits in inventory with no work order behind it. A return that applies in that window must not
// draw its units from that consumption: if it did, the undo of the withdrawal would return only
// what the restore left, and the returned units would be lost with every step done. The third
// validation reached that in four orders of events (its probes B2 to B5). Each case builds
// `ReturnPartsUseCase` and `WithdrawPartsUseCase` from the application's own providers, wraps a
// dependency only to fix the order of events, and ends in the same state.
//
// The work order withdrew 3 units that reached it and were confirmed. A return of 2 and a
// withdrawal of 4 then meet. The withdrawal never reaches the work order, so the right end state is
// the one with the return applied and the withdrawal undone: 1 unit outstanding on the work order
// and in inventory, and the shelf 1 unit below its opening stock.
const SHELF = 20;
const PLANNED = 10;
const FIRST_WITHDRAWAL = 3;
const RETURNED = 2;
const IN_FLIGHT = 4;
const GATE_TIMEOUT_MS = 10_000;

let testApp: TestApp;
let dataSource: DataSource;
let workOrders: WorkOrderRepository;
let steps: PendingStockSteps;
let ledger: StockLedger;
let items: InventoryItemRepository;
let transactionRunner: TransactionRunner;
let idGenerator: IdGenerator;
let clock: Clock;
let events: DomainEventPublisher;
let settings: OutboxSettings;
let stepLog: StockStepLog;
let applier: StockStepApplier;
let actorId: string;
const madeWorkOrders: string[] = [];
const openedGates: Gate[] = [];

beforeAll(async () => {
  testApp = await createTestApp();
  dataSource = testApp.dataSource;
  workOrders = testApp.app.get<WorkOrderRepository>(WORK_ORDER_REPOSITORY);
  steps = testApp.app.get<PendingStockSteps>(PENDING_STOCK_STEPS);
  ledger = testApp.app.get<StockLedger>(STOCK_LEDGER);
  items = testApp.app.get<InventoryItemRepository>(INVENTORY_ITEM_REPOSITORY);
  transactionRunner = testApp.app.get<TransactionRunner>(TRANSACTION_RUNNER);
  idGenerator = testApp.app.get<IdGenerator>(ID_GENERATOR);
  clock = testApp.app.get<Clock>(CLOCK);
  events = testApp.app.get<DomainEventPublisher>(DOMAIN_EVENT_PUBLISHER);
  settings = testApp.app.get<OutboxSettings>(OUTBOX_SETTINGS);
  stepLog = testApp.app.get<StockStepLog>(STOCK_STEP_LOG);
  applier = testApp.app.get(StockStepApplier);
  actorId = (await insertUser()).externalId;
});

afterEach(async () => {
  // A case that stopped midway must not leave a withdrawal waiting at a gate.
  for (const opened of openedGates.splice(0)) {
    opened.open();
  }
  await dataSource.query(
    `DELETE FROM work_order_stock_steps
      WHERE work_order_id IN (SELECT id FROM work_orders WHERE external_id = ANY($1::uuid[]))`,
    [madeWorkOrders.splice(0)],
  );
});

afterAll(async () => {
  await testApp.close();
});

interface Gate {
  open: () => void;
  wait: () => Promise<void>;
}

// A point where one use case waits for another to get there, so that a case fixes the order of the
// events. A gate that never opens fails the case after ten seconds, so a wrong order cannot hang
// it.
function gate(label: string): Gate {
  let open: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  const created: Gate = {
    open,
    wait: () =>
      new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`the gate "${label}" did not open in time`)),
          GATE_TIMEOUT_MS,
        );
        void opened.then(() => {
          clearTimeout(timer);
          resolve();
        });
      }),
  };
  openedGates.push(created);
  return created;
}

interface SeededUser {
  internalId: number;
  externalId: string;
}

async function insertUser(): Promise<SeededUser> {
  const externalId = randomUUID();
  const rows: Array<{ id: number }> = await dataSource.query(
    `INSERT INTO users (external_id, email, password_hash, name, document, status, created_at, updated_at)
     VALUES ($1, $2, 'hash', 'Test User', $3, 'ACTIVE', now(), now())
     RETURNING id`,
    [externalId, `${externalId}@example.com`, Math.random().toString().slice(2, 13)],
  );
  return { internalId: rows[0].id, externalId };
}

// The customer and the vehicle a work order points at, over a user of their own: a dedicated user
// avoids `ux_customers_user_id`.
async function insertCustomerAndVehicle(): Promise<{ customerId: string; vehicleId: string }> {
  const owner = await insertUser();
  const customerId = randomUUID();
  const customerRows: Array<{ id: number }> = await dataSource.query(
    `INSERT INTO customers (external_id, user_id, status, created_at, updated_at)
     VALUES ($1, $2, 'ACTIVE', now(), now())
     RETURNING id`,
    [customerId, owner.internalId],
  );
  const vehicleId = randomUUID();
  await dataSource.query(
    `INSERT INTO vehicles (external_id, customer_id, plate, brand, model, year, created_at, updated_at)
     VALUES ($1, $2, $3, 'Toyota', 'Corolla', 2020, now(), now())`,
    [vehicleId, customerRows[0].id, Math.random().toString(36).slice(2, 9).toUpperCase()],
  );
  return { customerId, vehicleId };
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
  number: string;
  itemId: string;
  partItemId: string;
}

// A work order in execution, saved through the real repository, that planned 10 units of one part
// and has already withdrawn 3 of them through the real use case, confirmation included. A case that
// asks for a confirmation that fails once gets the withdrawal saved with its consumption still
// unconfirmed and the confirmation step waiting for a second attempt.
async function scenario(options: { confirmationFailsOnce?: boolean } = {}): Promise<Scenario> {
  const itemId = await buildStockedItem(SHELF);
  const { customerId, vehicleId } = await insertCustomerAndVehicle();
  const workOrderId = randomUUID();
  const number = uniqueWorkOrderNumber();
  const partItemId = randomUUID();
  const decidedAt = new Date();
  await workOrders.save(
    WorkOrder.restore({
      id: WorkOrderId.create(workOrderId),
      number: WorkOrderNumber.create(number),
      customerId,
      vehicleId,
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
      budgets: [
        Budget.restore({
          id: BudgetId.create(randomUUID()),
          round: 1,
          total: Money.fromCents(PLANNED * 2500),
          status: BudgetStatus.Approved,
          generatedAt: decidedAt,
          decidedAt,
          decidedByUserId: actorId,
        }),
      ],
      budgetDecidedAt: decidedAt,
      budgetDecidedByUserId: actorId,
      executionStartedAt: decidedAt,
    }),
  );
  madeWorkOrders.push(workOrderId);
  const fixture = { workOrderId, number, itemId, partItemId };
  const withdrawal = options.confirmationFailsOnce
    ? withdrawalUseCase({ applier: applierWhoseConfirmationFailsOnce() })
    : withdrawalUseCase();
  await withdrawal.execute(withdrawCommand(fixture, FIRST_WITHDRAWAL));
  return fixture;
}

function withdrawCommand(fixture: Scenario, quantity: number): WithdrawPartsCommand {
  return new WithdrawPartsCommand(
    fixture.number,
    [{ itemId: fixture.partItemId, quantity }],
    actorId,
  );
}

function returnCommand(fixture: Scenario, quantity: number): ReturnPartsCommand {
  return new ReturnPartsCommand(
    fixture.number,
    [{ itemId: fixture.partItemId, quantity }],
    actorId,
  );
}

// The use cases, built from the application's providers. A case hands one of them a wrapped
// dependency to fix the order of events.
function withdrawalUseCase(
  over: { workOrders?: WorkOrderRepository; ledger?: StockLedger; applier?: StockStepApplier } = {},
): WithdrawPartsUseCase {
  return new WithdrawPartsUseCase(
    over.workOrders ?? workOrders,
    transactionRunner,
    idGenerator,
    clock,
    over.ledger ?? ledger,
    steps,
    over.applier ?? applier,
    settings,
    events,
  );
}

function returnUseCase(over: { applier?: StockStepApplier } = {}): ReturnPartsUseCase {
  return new ReturnPartsUseCase(
    workOrders,
    transactionRunner,
    idGenerator,
    clock,
    steps,
    over.applier ?? applier,
    events,
  );
}

// Whoever cancels may cancel a work order in execution. Who may is not what these cases are about.
function cancellationUseCase(): CancelWorkOrderUseCase {
  const actors = new FakeWorkOrderActors().withCapabilities(actorId, { cancelsInExecution: true });
  return new CancelWorkOrderUseCase(
    workOrders,
    transactionRunner,
    new CancellationAuthorizer(actors),
    idGenerator,
    clock,
    steps,
    applier,
    events,
  );
}

// The fixture assigns the work order to the actor, so the actor may complete it.
function completionUseCase(): CompleteWorkOrderUseCase {
  return new CompleteWorkOrderUseCase(
    workOrders,
    new WorkOrderCompletionAuthorizer(new FakeWorkOrderActors()),
    clock,
    events,
  );
}

function deliveryUseCase(): DeliverVehicleUseCase {
  return new DeliverVehicleUseCase(
    workOrders,
    transactionRunner,
    idGenerator,
    clock,
    steps,
    applier,
    events,
  );
}

interface LedgerHooks {
  /** Runs once the consumption has committed. */
  afterConsume?: () => Promise<void>;
  /** The undo of the withdrawal fails, as an inventory that is down would make it. */
  undoFailure?: Error;
  /** The first restore fails, as an inventory that is busy would make it. */
  restoreFailsOnce?: boolean;
  /** The first confirmation fails, the same way. */
  confirmationFailsOnce?: boolean;
}

/** The real ledger, with the hooks a case needs between its calls. */
function ledgerWith(hooks: LedgerHooks): StockLedger {
  let restoreFailed = false;
  let confirmationFailed = false;
  return {
    consume: async (workOrderId, lines, actorUserId, operationId) => {
      await ledger.consume(workOrderId, lines, actorUserId, operationId);
      await hooks.afterConsume?.();
    },
    restore: (workOrderId, lines, actorUserId, operationId) => {
      if (hooks.restoreFailsOnce && !restoreFailed) {
        restoreFailed = true;
        return Promise.reject(new Error('inventory is busy'));
      }
      return ledger.restore(workOrderId, lines, actorUserId, operationId);
    },
    undoConsumption: (operationId, actorUserId) =>
      hooks.undoFailure
        ? Promise.reject(hooks.undoFailure)
        : ledger.undoConsumption(operationId, actorUserId),
    confirmConsumption: (operationId, actorUserId) => {
      if (hooks.confirmationFailsOnce && !confirmationFailed) {
        confirmationFailed = true;
        return Promise.reject(new Error('inventory is busy'));
      }
      return ledger.confirmConsumption(operationId, actorUserId);
    },
    settle: (workOrderId, actorUserId) => ledger.settle(workOrderId, actorUserId),
    writeOff: (workOrderId, actorUserId) => ledger.writeOff(workOrderId, actorUserId),
  };
}

// The applier a return uses when its first attempt meets an inventory that fails once.
function applierWhoseRestoreFailsOnce(): StockStepApplier {
  return new StockStepApplier(
    steps,
    ledgerWith({ restoreFailsOnce: true }),
    clock,
    stepLog,
    settings,
  );
}

// The applier a withdrawal uses when its attempt at the confirmation meets an inventory that fails
// once.
function applierWhoseConfirmationFailsOnce(): StockStepApplier {
  return new StockStepApplier(
    steps,
    ledgerWith({ confirmationFailsOnce: true }),
    clock,
    stepLog,
    settings,
  );
}

// Runs a withdrawal that waits, after its consumption has committed, until the case lets it go.
function stalledWithdrawal(fixture: Scenario, stall: Gate, consumed: Gate) {
  return withdrawalUseCase({
    ledger: ledgerWith({
      afterConsume: async () => {
        consumed.open();
        await stall.wait();
      },
    }),
  })
    .execute(withdrawCommand(fixture, IN_FLIGHT))
    .then(
      () => undefined,
      (error: unknown) => error,
    );
}

function secondsFromNow(seconds: number): Date {
  return new Date(Date.now() + seconds * 1000);
}

async function quantityOf(itemId: string): Promise<number> {
  const rows: Array<{ quantity_on_hand: number }> = await dataSource.query(
    `SELECT quantity_on_hand FROM inventory_items WHERE external_id = $1`,
    [itemId],
  );
  return rows[0].quantity_on_hand;
}

// What the ledger of inventory still holds on the work order: every consumption less the returns
// that point at it, whatever its status.
async function outstandingInInventory(fixture: Scenario): Promise<number> {
  const rows: Array<{ outstanding: number }> = await dataSource.query(
    `SELECT COALESCE(SUM(sm.quantity - COALESCE(returned.total, 0)), 0)::int AS outstanding
       FROM stock_movements sm
       JOIN inventory_items ii ON ii.id = sm.inventory_item_id
       JOIN work_orders wo ON wo.id = sm.work_order_id
       LEFT JOIN (
         SELECT undoes_movement_id, SUM(quantity) AS total
           FROM stock_movements
          WHERE kind = 'RETURN'
          GROUP BY undoes_movement_id
       ) returned ON returned.undoes_movement_id = sm.id
      WHERE wo.external_id = $1 AND ii.external_id = $2 AND sm.kind = 'CONSUMPTION'`,
    [fixture.workOrderId, fixture.itemId],
  );
  return rows[0].outstanding;
}

async function outstandingOnWorkOrder(fixture: Scenario): Promise<number | undefined> {
  const found = await workOrders.findByNumber(WorkOrderNumber.create(fixture.number));
  return found?.partItems[0].withdrawnQuantity;
}

async function transitionsOf(itemId: string): Promise<Array<[string, number | null]>> {
  const rows: Array<{ to_status: string; quantity: number | null }> = await dataSource.query(
    `SELECT t.to_status, t.quantity
       FROM stock_movement_transitions t
       JOIN stock_movements sm ON sm.id = t.stock_movement_id
       JOIN inventory_items ii ON ii.id = sm.inventory_item_id
      WHERE ii.external_id = $1
      ORDER BY t.id`,
    [itemId],
  );
  return rows.map((row) => [row.to_status, row.quantity]);
}

async function stepsOf(workOrderId: string): Promise<Array<[string, string]>> {
  const rows: Array<{ kind: string; status: string }> = await dataSource.query(
    `SELECT s.kind, s.status
       FROM work_order_stock_steps s
       JOIN work_orders wo ON wo.id = s.work_order_id
      WHERE wo.external_id = $1
      ORDER BY s.id`,
    [workOrderId],
  );
  return rows.map((row) => [row.kind, row.status]);
}

// The same list with the attempts each step counted.
async function stepAttemptsOf(workOrderId: string): Promise<Array<[string, string, number]>> {
  const rows: Array<{ kind: string; status: string; attempts: number }> = await dataSource.query(
    `SELECT s.kind, s.status, s.attempts
       FROM work_order_stock_steps s
       JOIN work_orders wo ON wo.id = s.work_order_id
      WHERE wo.external_id = $1
      ORDER BY s.id`,
    [workOrderId],
  );
  return rows.map((row) => [row.kind, row.status, row.attempts]);
}

// The consumptions of the item: the units, the status and whether the work order confirmed it.
async function consumptionsOf(itemId: string): Promise<Array<[number, string | null, boolean]>> {
  const rows: Array<{ quantity: number; status: string | null; confirmed_at: Date | null }> =
    await dataSource.query(
      `SELECT sm.quantity, sm.status, sm.confirmed_at
         FROM stock_movements sm
         JOIN inventory_items ii ON ii.id = sm.inventory_item_id
        WHERE ii.external_id = $1 AND sm.kind = 'CONSUMPTION'
        ORDER BY sm.id`,
      [itemId],
    );
  return rows.map((row) => [row.quantity, row.status, row.confirmed_at !== null]);
}

// The end state every case reaches before the cancellation: the work order and inventory agree on
// the 1 unit that is still outstanding, and the shelf is 1 unit below its opening stock.
async function expectReturnAppliedAndWithdrawalUndone(fixture: Scenario): Promise<void> {
  expect(await outstandingOnWorkOrder(fixture)).toBe(FIRST_WITHDRAWAL - RETURNED);
  expect(await outstandingInInventory(fixture)).toBe(FIRST_WITHDRAWAL - RETURNED);
  expect(await quantityOf(fixture.itemId)).toBe(SHELF - (FIRST_WITHDRAWAL - RETURNED));
}

// A cancellation that follows loses the 1 unit that is outstanding, and no more.
async function cancelAndExpectOneUnitWrittenOff(fixture: Scenario): Promise<void> {
  await cancellationUseCase().execute(
    new CancelWorkOrderCommand(fixture.number, 'No show', actorId),
  );
  expect(await transitionsOf(fixture.itemId)).toEqual([
    ['WRITTEN_OFF', FIRST_WITHDRAWAL - RETURNED],
  ]);
}

const DONE = 'DONE';

describe('a return beside a withdrawal in flight, through the real use cases', () => {
  it('B2: a return that saves and applies while a withdrawal that loaded the work order earlier consumes draws from the confirmed consumption, so the undo of the withdrawal returns all its units', async () => {
    const fixture = await scenario();
    const loaded = gate('the withdrawal loaded the work order');
    const returnCommitted = gate('the return committed');
    const consumed = gate('the withdrawal consumed');
    const restoreApplied = gate('the restore was applied');
    // The withdrawal loads the work order and waits for the return to commit.
    const racingWorkOrders: WorkOrderRepository = {
      findByNumber: async (number) => {
        const found = await workOrders.findByNumber(number);
        loaded.open();
        await returnCommitted.wait();
        return found;
      },
      save: (workOrder) => workOrders.save(workOrder),
    };
    // The return applies its restore after the withdrawal consumed, and the withdrawal goes on
    // once the restore was applied.
    const returnApplier = {
      applyAfterCommit: async (operationId: string) => {
        returnCommitted.open();
        await consumed.wait();
        await applier.applyAfterCommit(operationId);
        restoreApplied.open();
      },
    } as unknown as StockStepApplier;
    const withdrawal = withdrawalUseCase({
      workOrders: racingWorkOrders,
      ledger: ledgerWith({
        afterConsume: async () => {
          consumed.open();
          await restoreApplied.wait();
        },
      }),
    })
      .execute(withdrawCommand(fixture, IN_FLIGHT))
      .then(
        () => undefined,
        (error: unknown) => error,
      );
    await loaded.wait();

    const [withdrawalOutcome] = await Promise.all([
      withdrawal,
      returnUseCase({ applier: returnApplier }).execute(returnCommand(fixture, RETURNED)),
    ]);

    // The return saved first, so the withdrawal, which loaded the work order before it, answers 409.
    expect(withdrawalOutcome).toBeInstanceOf(ConcurrentModificationError);
    await expectReturnAppliedAndWithdrawalUndone(fixture);
    await cancelAndExpectOneUnitWrittenOff(fixture);
    expect(await stepsOf(fixture.workOrderId)).toEqual([
      ['UNDO_CONSUMPTION', DONE],
      ['CONFIRM_CONSUMPTION', DONE],
      ['RESTORE', DONE],
      ['UNDO_CONSUMPTION', DONE],
      ['WRITE_OFF', DONE],
    ]);
  });

  it('B3: a restore that failed and a withdrawal that stalls after consuming: the processor applies the restore from the confirmed consumption and then the undo returns all the units of the withdrawal', async () => {
    const fixture = await scenario();
    await returnUseCase({ applier: applierWhoseRestoreFailsOnce() }).execute(
      returnCommand(fixture, RETURNED),
    );
    const stall = gate('the withdrawal may go on');
    const consumed = gate('the withdrawal consumed');
    const withdrawal = stalledWithdrawal(fixture, stall, consumed);
    await consumed.wait();
    expect(await quantityOf(fixture.itemId)).toBe(SHELF - FIRST_WITHDRAWAL - IN_FLIGHT);

    // The processor runs past the wait of the restore, and then past the grace period of the undo.
    await drainStockStepsOfWorkOrder(testApp.app, fixture.workOrderId, secondsFromNow(5));
    await drainStockStepsOfWorkOrder(
      testApp.app,
      fixture.workOrderId,
      secondsFromNow(settings.graceSeconds + 1),
    );
    stall.open();

    // The processor claimed the armed step, so the withdrawal that goes on finds it taken.
    expect(await withdrawal).toBeInstanceOf(ConcurrentModificationError);
    await expectReturnAppliedAndWithdrawalUndone(fixture);
    await cancelAndExpectOneUnitWrittenOff(fixture);
    expect(await stepsOf(fixture.workOrderId)).toEqual([
      ['UNDO_CONSUMPTION', DONE],
      ['CONFIRM_CONSUMPTION', DONE],
      ['RESTORE', DONE],
      ['UNDO_CONSUMPTION', DONE],
      ['WRITE_OFF', DONE],
    ]);
  });

  it('B4: a restore that failed and a withdrawal whose save and undo both fail: the processor undoes the withdrawal and applies the restore, whichever runs first', async () => {
    const fixture = await scenario();
    await returnUseCase({ applier: applierWhoseRestoreFailsOnce() }).execute(
      returnCommand(fixture, RETURNED),
    );
    const failingSave = new Error('the save failed');
    const failingWorkOrders: WorkOrderRepository = {
      findByNumber: (number) => workOrders.findByNumber(number),
      save: () => Promise.reject(failingSave),
    };

    // The withdrawal consumes, its save fails, its own undo fails, and it hands the step over.
    await expect(
      withdrawalUseCase({
        workOrders: failingWorkOrders,
        ledger: ledgerWith({ undoFailure: new Error('inventory is down') }),
      }).execute(withdrawCommand(fixture, IN_FLIGHT)),
    ).rejects.toBe(failingSave);
    expect(await quantityOf(fixture.itemId)).toBe(SHELF - FIRST_WITHDRAWAL - IN_FLIGHT);

    // The processor runs twice: the undo is due at once, and the restore only after its wait.
    await drainStockStepsOfWorkOrder(testApp.app, fixture.workOrderId);
    await drainStockStepsOfWorkOrder(testApp.app, fixture.workOrderId, secondsFromNow(5));

    await expectReturnAppliedAndWithdrawalUndone(fixture);
    await cancelAndExpectOneUnitWrittenOff(fixture);
    expect(await stepsOf(fixture.workOrderId)).toEqual([
      ['UNDO_CONSUMPTION', DONE],
      ['CONFIRM_CONSUMPTION', DONE],
      ['RESTORE', DONE],
      ['UNDO_CONSUMPTION', DONE],
      ['WRITE_OFF', DONE],
    ]);
  });

  it('B5: a restore that failed, a withdrawal that stalls after consuming and a cancellation saved meanwhile: the write-off loses the 1 unit that stays outstanding and the undo returns all the units of the withdrawal', async () => {
    const fixture = await scenario();
    await returnUseCase({ applier: applierWhoseRestoreFailsOnce() }).execute(
      returnCommand(fixture, RETURNED),
    );
    const stall = gate('the withdrawal may go on');
    const consumed = gate('the withdrawal consumed');
    const withdrawal = stalledWithdrawal(fixture, stall, consumed);
    await consumed.wait();

    // The cancellation is saved with its step, and its attempt claims nothing behind the restore.
    await cancellationUseCase().execute(
      new CancelWorkOrderCommand(fixture.number, 'No show', actorId),
    );
    expect((await stepsOf(fixture.workOrderId)).slice(-2)).toEqual([
      ['UNDO_CONSUMPTION', 'ARMED'],
      ['WRITE_OFF', 'PENDING'],
    ]);
    expect(await transitionsOf(fixture.itemId)).toEqual([]);

    // The processor runs past the wait of the restore, and then past the grace period of the undo.
    await drainStockStepsOfWorkOrder(testApp.app, fixture.workOrderId, secondsFromNow(5));
    await drainStockStepsOfWorkOrder(
      testApp.app,
      fixture.workOrderId,
      secondsFromNow(settings.graceSeconds + 1),
    );
    stall.open();

    expect(await withdrawal).toBeInstanceOf(ConcurrentModificationError);
    await expectReturnAppliedAndWithdrawalUndone(fixture);
    expect(await transitionsOf(fixture.itemId)).toEqual([
      ['WRITTEN_OFF', FIRST_WITHDRAWAL - RETURNED],
    ]);
    expect(await stepsOf(fixture.workOrderId)).toEqual([
      ['UNDO_CONSUMPTION', DONE],
      ['CONFIRM_CONSUMPTION', DONE],
      ['RESTORE', DONE],
      ['UNDO_CONSUMPTION', DONE],
      ['WRITE_OFF', DONE],
    ]);
  });
});

// The confirmation of a withdrawal is a step of its work order, and it holds the steps recorded
// after it. A settlement and a write-off read confirmed consumptions only, so one that applied
// before the confirmation would close nothing of that withdrawal and be done for good, with the
// consumption left pending on a delivered or canceled work order. The fourth validation's probes N1
// and N2 follow a withdrawal of 3 units whose confirmation fails once with a delivery and with a
// cancellation. Each closing step waits, and the processor then applies the confirmation and the
// closing step in the order they were recorded.
describe('a closing step recorded after a withdrawal whose confirmation failed, through the real use cases', () => {
  it('N1: a delivery waits for the confirmation, and the processor then confirms the consumption and settles it', async () => {
    const fixture = await scenario({ confirmationFailsOnce: true });
    expect(await stepAttemptsOf(fixture.workOrderId)).toEqual([
      ['UNDO_CONSUMPTION', DONE, 0],
      ['CONFIRM_CONSUMPTION', 'PENDING', 1],
    ]);
    expect(await consumptionsOf(fixture.itemId)).toEqual([[FIRST_WITHDRAWAL, 'PENDING', false]]);
    await completionUseCase().execute(new CompleteWorkOrderCommand(fixture.number, actorId));

    // The delivery is saved with its step, and its attempt claims nothing behind the confirmation.
    await deliveryUseCase().execute(new DeliverVehicleCommand(fixture.number, actorId));

    expect(await stepAttemptsOf(fixture.workOrderId)).toEqual([
      ['UNDO_CONSUMPTION', DONE, 0],
      ['CONFIRM_CONSUMPTION', 'PENDING', 1],
      ['SETTLE', 'PENDING', 0],
    ]);
    expect(await consumptionsOf(fixture.itemId)).toEqual([[FIRST_WITHDRAWAL, 'PENDING', false]]);
    expect(await transitionsOf(fixture.itemId)).toEqual([]);
    expect(await quantityOf(fixture.itemId)).toBe(SHELF - FIRST_WITHDRAWAL);

    // The processor runs past the wait of the confirmation: the confirmation first, then the
    // settlement.
    await drainStockStepsOfWorkOrder(testApp.app, fixture.workOrderId, secondsFromNow(5));

    expect(await stepAttemptsOf(fixture.workOrderId)).toEqual([
      ['UNDO_CONSUMPTION', DONE, 0],
      ['CONFIRM_CONSUMPTION', DONE, 2],
      ['SETTLE', DONE, 1],
    ]);
    expect(await consumptionsOf(fixture.itemId)).toEqual([[FIRST_WITHDRAWAL, 'SETTLED', true]]);
    expect(await transitionsOf(fixture.itemId)).toEqual([['SETTLED', null]]);
    expect(await quantityOf(fixture.itemId)).toBe(SHELF - FIRST_WITHDRAWAL);
  });

  it('N2: a cancellation waits for the confirmation, and the processor then confirms the consumption and writes off the units that are outstanding', async () => {
    const fixture = await scenario({ confirmationFailsOnce: true });

    // The cancellation is saved with its step, and its attempt claims nothing behind the
    // confirmation.
    await cancellationUseCase().execute(
      new CancelWorkOrderCommand(fixture.number, 'No show', actorId),
    );

    expect(await stepAttemptsOf(fixture.workOrderId)).toEqual([
      ['UNDO_CONSUMPTION', DONE, 0],
      ['CONFIRM_CONSUMPTION', 'PENDING', 1],
      ['WRITE_OFF', 'PENDING', 0],
    ]);
    expect(await consumptionsOf(fixture.itemId)).toEqual([[FIRST_WITHDRAWAL, 'PENDING', false]]);
    expect(await transitionsOf(fixture.itemId)).toEqual([]);
    expect(await quantityOf(fixture.itemId)).toBe(SHELF - FIRST_WITHDRAWAL);

    // The processor runs past the wait of the confirmation: the confirmation first, then the
    // write-off.
    await drainStockStepsOfWorkOrder(testApp.app, fixture.workOrderId, secondsFromNow(5));

    expect(await stepAttemptsOf(fixture.workOrderId)).toEqual([
      ['UNDO_CONSUMPTION', DONE, 0],
      ['CONFIRM_CONSUMPTION', DONE, 2],
      ['WRITE_OFF', DONE, 1],
    ]);
    expect(await consumptionsOf(fixture.itemId)).toEqual([[FIRST_WITHDRAWAL, 'WRITTEN_OFF', true]]);
    expect(await transitionsOf(fixture.itemId)).toEqual([['WRITTEN_OFF', FIRST_WITHDRAWAL]]);
    expect(await quantityOf(fixture.itemId)).toBe(SHELF - FIRST_WITHDRAWAL);
  });
});
