import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { FakeIdGenerator } from '../../../../../../test/support/fakes/fake-id-generator';
import { FakePendingStockSteps } from '../../../../../../test/support/fakes/fake-pending-stock-steps';
import { FakeStockLedger } from '../../../../../../test/support/fakes/fake-stock-ledger';
import { FakeTransactionRunner } from '../../../../../../test/support/fakes/fake-transaction-runner';
import { InMemoryWorkOrderRepository } from '../../../../../../test/support/fakes/in-memory-work-order.repository';
import { RecordingDomainEventPublisher } from '../../../../../../test/support/fakes/recording-domain-event-publisher';
import { RecordingStockStepLog } from '../../../../../../test/support/fakes/recording-stock-step-log';
import { Money } from '../../../../../shared/domain/value-objects/money';
import { BudgetStatus } from '../../../domain/budget-status';
import { Budget } from '../../../domain/entities/budget';
import { WorkOrder } from '../../../domain/entities/work-order';
import { WorkOrderPartItem } from '../../../domain/entities/work-order-part-item';
import { ReturnExceedsWithdrawnError } from '../../../domain/errors/return-exceeds-withdrawn.error';
import { WorkOrderNotFoundError } from '../../../domain/errors/work-order-not-found.error';
import { WorkOrderStateError } from '../../../domain/errors/work-order-state.error';
import { PartReturned } from '../../../domain/events/part-returned.event';
import { BudgetId } from '../../../domain/value-objects/budget-id';
import { PlannedQuantity } from '../../../domain/value-objects/planned-quantity';
import { WorkOrderId } from '../../../domain/value-objects/work-order-id';
import { WorkOrderItemId } from '../../../domain/value-objects/work-order-item-id';
import { WorkOrderNumber } from '../../../domain/value-objects/work-order-number';
import { WorkOrderStatus } from '../../../domain/work-order-status';
import { OutboxSettings } from '../../outbox-settings';
import { StockStepKind } from '../../ports/pending-stock-steps.port';
import { StockStepApplier } from '../../services/stock-step-applier';
import { ReturnPartsCommand } from './return-parts.command';
import { ReturnPartsUseCase } from './return-parts.use-case';

const CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';
const VEHICLE_ID = '33333333-3333-4333-8333-333333333333';
const CREATOR_ID = '44444444-4444-4444-8444-444444444444';
const MECHANIC_ID = '55555555-5555-4555-8555-555555555555';
const NUMBER = 'A1B090-2026';
const NOW = new Date('2026-08-31T12:00:00.000Z');
const WITHDRAWN_ITEM_ID = WorkOrderItemId.create('66666666-6666-4666-8666-666666666666');
const WITHDRAWN_INVENTORY_ITEM_ID = '77777777-7777-4777-8777-777777777777';
// The first id `FakeIdGenerator` hands out, which the use case draws as the return's operation id.
const OPERATION_ID = '00000000-0000-4000-8000-000000000001';

function withdrawnPart(withdrawnQuantity = 2): WorkOrderPartItem {
  return WorkOrderPartItem.restore({
    id: WITHDRAWN_ITEM_ID,
    inventoryItemId: WITHDRAWN_INVENTORY_ITEM_ID,
    sku: 'FLT-001',
    itemName: 'Filtro de oleo',
    unitPrice: Money.fromCents(2500),
    plannedQuantity: PlannedQuantity.create(3),
    withdrawnQuantity,
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
    partItems: [withdrawnPart()],
    diagnosisStartedAt: NOW,
    diagnosisCompletedAt: NOW,
    budgets: [budget],
    budgetDecidedAt: NOW,
    budgetDecidedByUserId: CUSTOMER_ID,
    executionStartedAt: NOW,
  });
}

// The use case reaches the work order repository, the outbox and the event publisher through
// `transactionRunner.watch`, which records the calls in order and tells which of them ran while the
// transaction was open. The applier works on the plain fakes, so the ledger call it makes shows
// whether it ran inside the transaction.
function makeUseCase(refusal?: Error) {
  const transactionRunner = new FakeTransactionRunner();
  const workOrders = new InMemoryWorkOrderRepository(() => transactionRunner.active);
  const stockLedger = new FakeStockLedger(() => transactionRunner.active);
  if (refusal) {
    stockLedger.refuseWith(refusal);
  }
  const clock = new FakeClock();
  const steps = new FakePendingStockSteps(clock);
  const settings: OutboxSettings = { pollIntervalMs: 5000, graceSeconds: 300, maxAttempts: 10 };
  const applier = new StockStepApplier(
    steps,
    stockLedger,
    clock,
    new RecordingStockStepLog(),
    settings,
  );
  const events = new RecordingDomainEventPublisher();
  const useCase = new ReturnPartsUseCase(
    transactionRunner.watch('workOrders', workOrders),
    transactionRunner,
    new FakeIdGenerator(),
    clock,
    transactionRunner.watch('steps', steps),
    applier,
    transactionRunner.watch('events', events),
  );
  return { useCase, workOrders, transactionRunner, stockLedger, steps, clock, events };
}

const RETURN_TWO = new ReturnPartsCommand(
  NUMBER,
  [{ itemId: WITHDRAWN_ITEM_ID.value, quantity: 2 }],
  MECHANIC_ID,
);

describe('ReturnPartsUseCase', () => {
  it('refuses an unknown work order with WorkOrderNotFoundError', async () => {
    const { useCase, workOrders, events, steps } = makeUseCase();

    await expect(
      useCase.execute(
        new ReturnPartsCommand(
          'ZZZZZZ-2026',
          [{ itemId: WITHDRAWN_ITEM_ID.value, quantity: 1 }],
          MECHANIC_ID,
        ),
      ),
    ).rejects.toThrow(WorkOrderNotFoundError);
    expect(workOrders.workOrders).toHaveLength(0);
    expect(events.published).toHaveLength(0);
    expect(steps.stored.size).toBe(0);
  });

  it('validates on the aggregate before opening the transaction, so a rejected batch never starts one', async () => {
    const { useCase, workOrders, transactionRunner, stockLedger, steps, events } = makeUseCase();
    await workOrders.save(restoreInExecution(WorkOrderStatus.AwaitingApproval));

    await expect(
      useCase.execute(
        new ReturnPartsCommand(
          NUMBER,
          [{ itemId: WITHDRAWN_ITEM_ID.value, quantity: 1 }],
          MECHANIC_ID,
        ),
      ),
    ).rejects.toThrow(WorkOrderStateError);
    expect(transactionRunner.runCalls).toBe(0);
    expect(stockLedger.restored).toHaveLength(0);
    expect(steps.stored.size).toBe(0);
    expect(events.published).toHaveLength(0);
  });

  it('lets ReturnExceedsWithdrawnError travel out untouched, before any transaction', async () => {
    const { useCase, workOrders, transactionRunner, stockLedger, steps, events } = makeUseCase();
    await workOrders.save(restoreInExecution());

    await expect(
      useCase.execute(
        new ReturnPartsCommand(
          NUMBER,
          [{ itemId: WITHDRAWN_ITEM_ID.value, quantity: 3 }],
          MECHANIC_ID,
        ),
      ),
    ).rejects.toThrow(ReturnExceedsWithdrawnError);
    expect(transactionRunner.runCalls).toBe(0);
    expect(stockLedger.restored).toHaveLength(0);
    expect(steps.stored.size).toBe(0);
    expect(events.published).toHaveLength(0);
  });

  it('saves the work order and records the restore step in one transaction, with plain lines and the actor', async () => {
    const { useCase, workOrders, transactionRunner, steps } = makeUseCase();
    await workOrders.save(restoreInExecution());

    await useCase.execute(RETURN_TWO);

    expect(transactionRunner.runCalls).toBe(1);
    expect(transactionRunner.callsInside).toEqual(['workOrders.save', 'steps.enqueue']);
    const updated = workOrders.workOrders[0];
    expect(updated.partItems[0].withdrawnQuantity).toBe(0);
    expect(workOrders.savedInsideTransaction).toEqual([NUMBER]);
    expect(steps.stateOf(OPERATION_ID).step).toEqual({
      operationId: OPERATION_ID,
      kind: StockStepKind.Restore,
      workOrderId: updated.id.value,
      actorUserId: MECHANIC_ID,
      lines: [{ inventoryItemId: WITHDRAWN_INVENTORY_ITEM_ID, quantity: 2 }],
    });
  });

  it('applies the step after the commit: restores the stock under the step operation id, outside the transaction, and completes the step', async () => {
    const { useCase, workOrders, stockLedger, steps } = makeUseCase();
    await workOrders.save(restoreInExecution());

    await useCase.execute(RETURN_TWO);

    expect(stockLedger.restored).toEqual([
      {
        workOrderId: workOrders.workOrders[0].id.value,
        lines: [{ inventoryItemId: WITHDRAWN_INVENTORY_ITEM_ID, quantity: 2 }],
        actorUserId: MECHANIC_ID,
        operationId: OPERATION_ID,
        insideTransaction: false,
      },
    ]);
    expect(steps.stateOf(OPERATION_ID)).toMatchObject({ status: 'DONE', attempts: 1 });
  });

  it('publishes the recorded events after the transaction', async () => {
    const { useCase, workOrders, clock, events, transactionRunner } = makeUseCase();
    await workOrders.save(restoreInExecution());

    await useCase.execute(
      new ReturnPartsCommand(
        NUMBER,
        [{ itemId: WITHDRAWN_ITEM_ID.value, quantity: 1 }],
        MECHANIC_ID,
      ),
    );

    expect(events.published).toEqual([
      new PartReturned(workOrders.workOrders[0].id.value, MECHANIC_ID, clock.now()),
    ]);
    expect(transactionRunner.callsInside).not.toContain('events.publish');
  });

  it('answers with the saved work order when the ledger fails, leaving the step pending with the error and the wait for the processor', async () => {
    const { useCase, workOrders, steps, clock, events } = makeUseCase(
      new Error('no pending consumption covers this return'),
    );
    await workOrders.save(restoreInExecution());

    await expect(useCase.execute(RETURN_TWO)).resolves.toBeUndefined();

    expect(workOrders.workOrders[0].partItems[0].withdrawnQuantity).toBe(0);
    expect(steps.stateOf(OPERATION_ID)).toMatchObject({
      status: 'PENDING',
      attempts: 1,
      lastError: 'no pending consumption covers this return',
      dueAt: new Date(clock.now().getTime() + 1000),
    });
    expect(events.published).toEqual([
      new PartReturned(workOrders.workOrders[0].id.value, MECHANIC_ID, clock.now()),
    ]);
  });

  it('answers with the saved work order when the claim of the step fails, leaving the step pending', async () => {
    const { useCase, workOrders, stockLedger, steps, events } = makeUseCase();
    await workOrders.save(restoreInExecution());
    steps.claimDue = () => Promise.reject(new Error('the database is down'));

    await expect(useCase.execute(RETURN_TWO)).resolves.toBeUndefined();

    expect(workOrders.workOrders[0].partItems[0].withdrawnQuantity).toBe(0);
    expect(stockLedger.restored).toEqual([]);
    expect(steps.stateOf(OPERATION_ID)).toMatchObject({ status: 'PENDING', attempts: 0 });
    expect(events.published).toHaveLength(1);
  });

  it('applies the step on a later attempt once the ledger answers again, restoring the stock once', async () => {
    const { useCase, workOrders, stockLedger, steps, clock } = makeUseCase(new Error('busy'));
    await workOrders.save(restoreInExecution());
    await useCase.execute(RETURN_TWO);
    const recovered = new FakeStockLedger();
    const retrying = new StockStepApplier(steps, recovered, clock, new RecordingStockStepLog(), {
      pollIntervalMs: 5000,
      graceSeconds: 300,
      maxAttempts: 10,
    });
    clock.advanceSeconds(1);

    await retrying.applyDue();
    await retrying.applyDue();

    expect(stockLedger.restored).toEqual([]);
    expect(recovered.restored).toMatchObject([
      { operationId: OPERATION_ID, lines: [{ quantity: 2 }] },
    ]);
    expect(steps.stateOf(OPERATION_ID)).toMatchObject({ status: 'DONE', attempts: 2 });
  });
});
