import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { FakeIdGenerator } from '../../../../../../test/support/fakes/fake-id-generator';
import { FakePendingStockSteps } from '../../../../../../test/support/fakes/fake-pending-stock-steps';
import { FakeStockLedger } from '../../../../../../test/support/fakes/fake-stock-ledger';
import { FakeTransactionRunner } from '../../../../../../test/support/fakes/fake-transaction-runner';
import { InMemoryWorkOrderRepository } from '../../../../../../test/support/fakes/in-memory-work-order.repository';
import { RecordingDomainEventPublisher } from '../../../../../../test/support/fakes/recording-domain-event-publisher';
import { ConcurrentModificationError } from '../../../../../shared/application/errors/concurrent-modification.error';
import { Money } from '../../../../../shared/domain/value-objects/money';
import { BudgetStatus } from '../../../domain/budget-status';
import { Budget } from '../../../domain/entities/budget';
import { WorkOrder } from '../../../domain/entities/work-order';
import { WorkOrderPartItem } from '../../../domain/entities/work-order-part-item';
import { WorkOrderItemNotFoundError } from '../../../domain/errors/work-order-item-not-found.error';
import { WorkOrderNotFoundError } from '../../../domain/errors/work-order-not-found.error';
import { WorkOrderStateError } from '../../../domain/errors/work-order-state.error';
import { PartWithdrawn } from '../../../domain/events/part-withdrawn.event';
import { BudgetId } from '../../../domain/value-objects/budget-id';
import { PlannedQuantity } from '../../../domain/value-objects/planned-quantity';
import { WorkOrderId } from '../../../domain/value-objects/work-order-id';
import { WorkOrderItemId } from '../../../domain/value-objects/work-order-item-id';
import { WorkOrderNumber } from '../../../domain/value-objects/work-order-number';
import { WorkOrderStatus } from '../../../domain/work-order-status';
import { OutboxSettings } from '../../outbox-settings';
import { StockStepKind } from '../../ports/pending-stock-steps.port';
import { StockLedger } from '../../ports/stock-ledger.port';
import { WithdrawPartsCommand } from './withdraw-parts.command';
import { WithdrawPartsUseCase } from './withdraw-parts.use-case';

const CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';
const VEHICLE_ID = '33333333-3333-4333-8333-333333333333';
const CREATOR_ID = '44444444-4444-4444-8444-444444444444';
const MECHANIC_ID = '55555555-5555-4555-8555-555555555555';
const NUMBER = 'A1B090-2026';
const NOW = new Date('2026-08-31T12:00:00.000Z');
const APPROVED_ITEM_ID = WorkOrderItemId.create('66666666-6666-4666-8666-666666666666');
const APPROVED_INVENTORY_ITEM_ID = '77777777-7777-4777-8777-777777777777';
// The first id `FakeIdGenerator` hands out, which the use case draws as the withdrawal's operation id.
const OPERATION_ID = '00000000-0000-4000-8000-000000000001';

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

// The use case reaches every collaborator through `transactionRunner.watch`, which records the
// calls in order and tells which of them ran while the transaction was open. The specs seed and
// inspect the plain fakes.
function makeUseCase(refusal?: Error, graceSeconds = 300) {
  const transactionRunner = new FakeTransactionRunner();
  const workOrders = new InMemoryWorkOrderRepository(() => transactionRunner.active);
  const stockLedger = new FakeStockLedger(() => transactionRunner.active);
  if (refusal) {
    stockLedger.refuseWith(refusal);
  }
  const clock = new FakeClock();
  const steps = new FakePendingStockSteps(clock);
  const events = new RecordingDomainEventPublisher();
  const settings: OutboxSettings = { pollIntervalMs: 5000, graceSeconds, maxAttempts: 10 };
  const useCase = new WithdrawPartsUseCase(
    transactionRunner.watch('workOrders', workOrders),
    transactionRunner,
    new FakeIdGenerator(),
    clock,
    transactionRunner.watch('ledger', stockLedger),
    transactionRunner.watch('steps', steps),
    settings,
    transactionRunner.watch('events', events),
  );
  return { useCase, workOrders, transactionRunner, stockLedger, steps, clock, events };
}

const WITHDRAW_TWO = new WithdrawPartsCommand(
  NUMBER,
  [{ itemId: APPROVED_ITEM_ID.value, quantity: 2 }],
  MECHANIC_ID,
);

describe('WithdrawPartsUseCase', () => {
  it('refuses an unknown work order with WorkOrderNotFoundError', async () => {
    const { useCase, workOrders, events, steps } = makeUseCase();

    await expect(
      useCase.execute(
        new WithdrawPartsCommand(
          'ZZZZZZ-2026',
          [{ itemId: APPROVED_ITEM_ID.value, quantity: 1 }],
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
        new WithdrawPartsCommand(
          NUMBER,
          [{ itemId: APPROVED_ITEM_ID.value, quantity: 1 }],
          MECHANIC_ID,
        ),
      ),
    ).rejects.toThrow(WorkOrderStateError);
    expect(transactionRunner.runCalls).toBe(0);
    expect(stockLedger.consumed).toHaveLength(0);
    expect(steps.stored.size).toBe(0);
    expect(events.published).toHaveLength(0);
  });

  it('lets every other aggregate guard error travel out untouched, before any transaction', async () => {
    const { useCase, workOrders, transactionRunner, stockLedger, steps, events } = makeUseCase();
    await workOrders.save(restoreInExecution());
    const unknownItemId = '99999999-9999-4999-8999-999999999999';

    await expect(
      useCase.execute(
        new WithdrawPartsCommand(NUMBER, [{ itemId: unknownItemId, quantity: 1 }], MECHANIC_ID),
      ),
    ).rejects.toThrow(WorkOrderItemNotFoundError);
    expect(transactionRunner.runCalls).toBe(0);
    expect(stockLedger.consumed).toHaveLength(0);
    expect(steps.stored.size).toBe(0);
    expect(events.published).toHaveLength(0);
  });

  it('arms the undo step, consumes the stock, then disarms the step and saves the work order in one transaction', async () => {
    const { useCase, workOrders, transactionRunner, stockLedger } = makeUseCase();
    await workOrders.save(restoreInExecution());

    await useCase.execute(WITHDRAW_TWO);

    expect(transactionRunner.calls).toEqual([
      'workOrders.findByNumber',
      'steps.arm',
      'ledger.consume',
      'steps.disarm',
      'workOrders.save',
      'events.publish',
    ]);
    expect(transactionRunner.runCalls).toBe(1);
    const updated = workOrders.workOrders[0];
    expect(updated.partItems[0].withdrawnQuantity).toBe(2);
    expect(workOrders.savedInsideTransaction).toEqual([NUMBER]);
    expect(stockLedger.consumed).toEqual([
      {
        workOrderId: updated.id.value,
        lines: [{ inventoryItemId: APPROVED_INVENTORY_ITEM_ID, quantity: 2 }],
        actorUserId: MECHANIC_ID,
        operationId: OPERATION_ID,
        insideTransaction: false,
      },
    ]);
  });

  it('keeps every ledger call outside the work-orders transaction, which holds the disarm and the save only', async () => {
    const { useCase, workOrders, transactionRunner } = makeUseCase();
    await workOrders.save(restoreInExecution());

    await useCase.execute(WITHDRAW_TWO);

    expect(transactionRunner.callsInside).toEqual(['steps.disarm', 'workOrders.save']);
  });

  it('arms an undo step for the operation, due after the grace period of the settings, and leaves it done', async () => {
    const { useCase, workOrders, steps, clock } = makeUseCase(undefined, 120);
    await workOrders.save(restoreInExecution());

    await useCase.execute(WITHDRAW_TWO);

    expect(steps.stateOf(OPERATION_ID)).toEqual({
      step: {
        operationId: OPERATION_ID,
        kind: StockStepKind.UndoConsumption,
        workOrderId: workOrders.workOrders[0].id.value,
        actorUserId: MECHANIC_ID,
      },
      status: 'DONE',
      attempts: 0,
      dueAt: new Date(clock.now().getTime() + 120_000),
      lastError: null,
    });
  });

  it('publishes the recorded events after the transaction', async () => {
    const { useCase, workOrders, clock, events, transactionRunner } = makeUseCase();
    await workOrders.save(restoreInExecution());

    await useCase.execute(
      new WithdrawPartsCommand(
        NUMBER,
        [{ itemId: APPROVED_ITEM_ID.value, quantity: 1 }],
        MECHANIC_ID,
      ),
    );

    expect(events.published).toEqual([
      new PartWithdrawn(workOrders.workOrders[0].id.value, MECHANIC_ID, clock.now()),
    ]);
    expect(transactionRunner.callsInside).not.toContain('events.publish');
  });

  it('lets the refusal raised by the stock side travel out untouched', async () => {
    const refusal = new StockRefusal('not enough stock');
    const { useCase, workOrders, stockLedger, events } = makeUseCase(refusal);
    await workOrders.save(restoreInExecution());

    await expect(
      useCase.execute(
        new WithdrawPartsCommand(
          NUMBER,
          [{ itemId: APPROVED_ITEM_ID.value, quantity: 1 }],
          MECHANIC_ID,
        ),
      ),
    ).rejects.toBe(refusal);
    expect(stockLedger.consumed).toHaveLength(0);
    expect(events.published).toHaveLength(0);
  });

  describe('when the consumption is refused', () => {
    it('saves nothing, undoes at once outside the transaction and completes the step', async () => {
      const { useCase, workOrders, transactionRunner, stockLedger, steps, events } = makeUseCase();
      await workOrders.save(restoreInExecution());
      const refusal = new StockRefusal('not enough stock');
      stockLedger.refuseWith(refusal, 'consume');

      await expect(useCase.execute(WITHDRAW_TWO)).rejects.toBe(refusal);

      expect(transactionRunner.runCalls).toBe(0);
      expect(transactionRunner.calls).not.toContain('workOrders.save');
      expect(stockLedger.undone).toEqual([
        { operationId: OPERATION_ID, actorUserId: MECHANIC_ID, insideTransaction: false },
      ]);
      expect(steps.stateOf(OPERATION_ID).status).toBe('DONE');
      expect(events.published).toHaveLength(0);
    });

    it('leaves the step to the processor, due now, when the undo fails too, and answers the first error', async () => {
      const { useCase, workOrders, stockLedger, steps, clock } = makeUseCase();
      await workOrders.save(restoreInExecution());
      const refusal = new StockRefusal('not enough stock');
      stockLedger
        .refuseWith(refusal, 'consume')
        .refuseWith(new Error('inventory is down'), 'undoConsumption');

      await expect(useCase.execute(WITHDRAW_TWO)).rejects.toBe(refusal);

      expect(steps.stateOf(OPERATION_ID)).toMatchObject({ status: 'PENDING', dueAt: clock.now() });
    });

    it('still answers the first error when the step cannot be handed to the processor either', async () => {
      const { useCase, workOrders, stockLedger, steps } = makeUseCase();
      await workOrders.save(restoreInExecution());
      const refusal = new StockRefusal('not enough stock');
      stockLedger
        .refuseWith(refusal, 'consume')
        .refuseWith(new Error('inventory is down'), 'undoConsumption');
      steps.release = () => Promise.reject(new Error('the database is down'));

      await expect(useCase.execute(WITHDRAW_TWO)).rejects.toBe(refusal);

      expect(steps.stateOf(OPERATION_ID).status).toBe('ARMED');
    });
  });

  describe('when the save fails after the consumption', () => {
    it('undoes the consumption outside the transaction, completes the step and answers the error of the save', async () => {
      const { useCase, workOrders, transactionRunner, stockLedger, steps, events } = makeUseCase();
      await workOrders.save(restoreInExecution());
      const saveFailure = new Error('the save failed');
      workOrders.save = () => Promise.reject(saveFailure);

      await expect(useCase.execute(WITHDRAW_TWO)).rejects.toBe(saveFailure);

      expect(transactionRunner.callsInside).toEqual(['steps.disarm', 'workOrders.save']);
      expect(stockLedger.consumed).toHaveLength(1);
      expect(stockLedger.undone).toEqual([
        { operationId: OPERATION_ID, actorUserId: MECHANIC_ID, insideTransaction: false },
      ]);
      expect(steps.stateOf(OPERATION_ID).status).toBe('DONE');
      expect(events.published).toHaveLength(0);
    });
  });

  describe('when the processor claimed the armed step before the last step', () => {
    // The grace period passes while the request is still working, and the processor claims the step.
    function claimWhenConsumed(
      stockLedger: FakeStockLedger,
      steps: FakePendingStockSteps,
      clock: FakeClock,
    ): void {
      const consume = stockLedger.consume.bind(stockLedger);
      stockLedger.consume = async (...args: Parameters<StockLedger['consume']>) => {
        await consume(...args);
        clock.advanceSeconds(300);
        await steps.claimDue(clock.now(), 10, new Date(clock.now().getTime() + 300_000), [
          OPERATION_ID,
        ]);
      };
    }

    it('answers 409 CONCURRENT_MODIFICATION without saving the work order, and still undoes the consumption', async () => {
      const { useCase, workOrders, transactionRunner, stockLedger, steps, clock, events } =
        makeUseCase();
      await workOrders.save(restoreInExecution());
      claimWhenConsumed(stockLedger, steps, clock);

      const failure = await useCase.execute(WITHDRAW_TWO).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(ConcurrentModificationError);
      expect((failure as ConcurrentModificationError).code).toBe('CONCURRENT_MODIFICATION');
      expect(transactionRunner.callsInside).toEqual(['steps.disarm']);
      expect(workOrders.savedInsideTransaction).toEqual([]);
      expect(stockLedger.undone).toEqual([
        { operationId: OPERATION_ID, actorUserId: MECHANIC_ID, insideTransaction: false },
      ]);
      expect(steps.stateOf(OPERATION_ID).status).toBe('DONE');
      expect(events.published).toHaveLength(0);
    });
  });

  describe('when the step cannot be armed', () => {
    it('consumes nothing and has nothing to undo', async () => {
      const { useCase, workOrders, stockLedger, steps } = makeUseCase();
      await workOrders.save(restoreInExecution());
      const armFailure = new Error('the database is down');
      steps.arm = () => Promise.reject(armFailure);

      await expect(useCase.execute(WITHDRAW_TWO)).rejects.toBe(armFailure);

      expect(stockLedger.consumed).toEqual([]);
      expect(stockLedger.undone).toEqual([]);
    });
  });
});
