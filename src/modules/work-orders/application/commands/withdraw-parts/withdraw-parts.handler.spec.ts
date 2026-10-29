import { describe, expect, it } from 'vitest';
import { stubEventBus } from '../../../../../../test/support/fakes/bus.stubs';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { FakeStockLedger } from '../../../../../../test/support/fakes/fake-stock-ledger';
import { FakeTransactionRunner } from '../../../../../../test/support/fakes/fake-transaction-runner';
import { InMemoryWorkOrderRepository } from '../../../../../../test/support/fakes/in-memory-work-order.repository';
import { Money } from '../../../../../shared/domain/value-objects/money';
import { BudgetStatus } from '../../../domain/budget-status';
import { Budget } from '../../../domain/entities/budget';
import { WorkOrder } from '../../../domain/entities/work-order';
import { WorkOrderPartItem } from '../../../domain/entities/work-order-part-item';
import { WorkOrderItemNotFoundError } from '../../../domain/errors/work-order-item-not-found.error';
import { WorkOrderNotFoundError } from '../../../domain/errors/work-order-not-found.error';
import { WorkOrderStateError } from '../../../domain/errors/work-order-state.error';
import { BudgetId } from '../../../domain/value-objects/budget-id';
import { PlannedQuantity } from '../../../domain/value-objects/planned-quantity';
import { WorkOrderId } from '../../../domain/value-objects/work-order-id';
import { WorkOrderItemId } from '../../../domain/value-objects/work-order-item-id';
import { WorkOrderNumber } from '../../../domain/value-objects/work-order-number';
import { WorkOrderStatus } from '../../../domain/work-order-status';
import { WithdrawPartsCommand } from './withdraw-parts.command';
import { WithdrawPartsHandler } from './withdraw-parts.handler';

const CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';
const VEHICLE_ID = '33333333-3333-4333-8333-333333333333';
const CREATOR_ID = '44444444-4444-4444-8444-444444444444';
const MECHANIC_ID = '55555555-5555-4555-8555-555555555555';
const NUMBER = 'A1B090-2026';
const NOW = new Date('2026-08-31T12:00:00.000Z');
const APPROVED_ITEM_ID = WorkOrderItemId.create('66666666-6666-4666-8666-666666666666');
const APPROVED_INVENTORY_ITEM_ID = '77777777-7777-4777-8777-777777777777';

function approvedRoundOnePart(): WorkOrderPartItem {
  return WorkOrderPartItem.restore({
    id: APPROVED_ITEM_ID,
    inventoryItemId: APPROVED_INVENTORY_ITEM_ID,
    sku: 'FLT-001',
    itemName: 'Filtro de oleo',
    unitPrice: Money.fromCents(2500),
    plannedQuantity: PlannedQuantity.create(3),
    withdrawnQuantity: 0,
    budgetRound: 1,
    budgetedUnitPrice: Money.fromCents(2500),
  });
}

function restoreInExecution(status: WorkOrderStatus = WorkOrderStatus.InExecution): WorkOrder {
  const budget = Budget.restore({
    id: BudgetId.create('88888888-8888-4888-8888-888888888888'),
    round: 1,
    total: Money.fromCents(7500),
    status: BudgetStatus.Approved,
    generatedAt: NOW,
    decidedAt: NOW,
    decidedByUserId: CUSTOMER_ID,
  });
  return WorkOrder.restore({
    id: WorkOrderId.create('11111111-1111-4111-8111-111111111111'),
    number: WorkOrderNumber.create(NUMBER),
    customerId: CUSTOMER_ID,
    vehicleId: VEHICLE_ID,
    assignedMechanicUserId: MECHANIC_ID,
    createdByUserId: CREATOR_ID,
    status,
    customerName: 'Jane Doe',
    vehiclePlate: 'ABC1234',
    vehicleBrand: 'Toyota',
    vehicleModel: 'Corolla',
    vehicleYear: 2020,
    createdAt: NOW,
    updatedAt: NOW,
    serviceItems: [],
    partItems: [approvedRoundOnePart()],
    diagnosisStartedAt: NOW,
    diagnosisCompletedAt: NOW,
    budgets: [budget],
    budgetDecidedAt: NOW,
    budgetDecidedByUserId: CUSTOMER_ID,
    executionStartedAt: NOW,
  });
}

/** Stands for the refusal inventory raises when stock falls short, which work orders never import. */
class StockRefusal extends Error {}

function makeHandler(refusal?: Error) {
  const workOrders = new InMemoryWorkOrderRepository();
  const transactionRunner = new FakeTransactionRunner();
  const stockLedger = new FakeStockLedger();
  if (refusal) {
    stockLedger.refuseWith(refusal);
  }
  const eventBus = stubEventBus();
  const handler = new WithdrawPartsHandler(
    workOrders,
    transactionRunner,
    new FakeClock(),
    stockLedger,
    eventBus.bus,
  );
  return { handler, workOrders, transactionRunner, stockLedger, eventBus };
}

describe('WithdrawPartsHandler', () => {
  it('refuses an unknown work order with WorkOrderNotFoundError', async () => {
    const { handler, workOrders } = makeHandler();

    await expect(
      handler.execute(
        new WithdrawPartsCommand(
          'ZZZZZZ-2026',
          [{ itemId: APPROVED_ITEM_ID.value, quantity: 1 }],
          MECHANIC_ID,
        ),
      ),
    ).rejects.toThrow(WorkOrderNotFoundError);
    expect(workOrders.workOrders).toHaveLength(0);
  });

  it('validates on the aggregate before opening the transaction, so a rejected batch never starts one', async () => {
    const { handler, workOrders, transactionRunner } = makeHandler();
    await workOrders.save(restoreInExecution(WorkOrderStatus.AwaitingApproval));

    await expect(
      handler.execute(
        new WithdrawPartsCommand(
          NUMBER,
          [{ itemId: APPROVED_ITEM_ID.value, quantity: 1 }],
          MECHANIC_ID,
        ),
      ),
    ).rejects.toThrow(WorkOrderStateError);
    expect(transactionRunner.runCalls).toBe(0);
  });

  it('lets every other aggregate guard error travel out untouched, before any transaction', async () => {
    const { handler, workOrders, transactionRunner } = makeHandler();
    await workOrders.save(restoreInExecution());
    const unknownItemId = '99999999-9999-4999-8999-999999999999';

    await expect(
      handler.execute(
        new WithdrawPartsCommand(NUMBER, [{ itemId: unknownItemId, quantity: 1 }], MECHANIC_ID),
      ),
    ).rejects.toThrow(WorkOrderItemNotFoundError);
    expect(transactionRunner.runCalls).toBe(0);
  });

  it('opens exactly one transaction, saves the work order, then consumes the stock through the ledger', async () => {
    const { handler, workOrders, transactionRunner, stockLedger } = makeHandler();
    await workOrders.save(restoreInExecution());

    await handler.execute(
      new WithdrawPartsCommand(
        NUMBER,
        [{ itemId: APPROVED_ITEM_ID.value, quantity: 2 }],
        MECHANIC_ID,
      ),
    );

    expect(transactionRunner.runCalls).toBe(1);
    const updated = workOrders.workOrders[0];
    expect(updated.partItems[0].withdrawnQuantity).toBe(2);
    expect(stockLedger.consumed).toEqual([
      {
        workOrderId: updated.id.value,
        lines: [{ inventoryItemId: APPROVED_INVENTORY_ITEM_ID, quantity: 2 }],
        actorUserId: MECHANIC_ID,
      },
    ]);
  });

  it('publishes the recorded events after the transaction', async () => {
    const { handler, workOrders, eventBus } = makeHandler();
    await workOrders.save(restoreInExecution());

    await handler.execute(
      new WithdrawPartsCommand(
        NUMBER,
        [{ itemId: APPROVED_ITEM_ID.value, quantity: 1 }],
        MECHANIC_ID,
      ),
    );

    expect(eventBus.publishAll).toHaveBeenCalledTimes(1);
  });

  it('lets the refusal raised by the stock side travel out untouched', async () => {
    const refusal = new StockRefusal('not enough stock');
    const { handler, workOrders } = makeHandler(refusal);
    await workOrders.save(restoreInExecution());

    await expect(
      handler.execute(
        new WithdrawPartsCommand(
          NUMBER,
          [{ itemId: APPROVED_ITEM_ID.value, quantity: 1 }],
          MECHANIC_ID,
        ),
      ),
    ).rejects.toBe(refusal);
  });
});
