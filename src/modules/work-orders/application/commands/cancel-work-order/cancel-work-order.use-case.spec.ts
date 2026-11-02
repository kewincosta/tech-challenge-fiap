import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { FakeIdGenerator } from '../../../../../../test/support/fakes/fake-id-generator';
import { FakePendingStockSteps } from '../../../../../../test/support/fakes/fake-pending-stock-steps';
import { FakeStockLedger } from '../../../../../../test/support/fakes/fake-stock-ledger';
import { FakeWorkOrderActors } from '../../../../../../test/support/fakes/fake-work-order-actors';
import { FakeTransactionRunner } from '../../../../../../test/support/fakes/fake-transaction-runner';
import { InMemoryWorkOrderRepository } from '../../../../../../test/support/fakes/in-memory-work-order.repository';
import { RecordingDomainEventPublisher } from '../../../../../../test/support/fakes/recording-domain-event-publisher';
import { RecordingStockStepLog } from '../../../../../../test/support/fakes/recording-stock-step-log';
import { Money } from '../../../../../shared/domain/value-objects/money';
import { WorkOrder } from '../../../domain/entities/work-order';
import { WorkOrderPartItem } from '../../../domain/entities/work-order-part-item';
import { CancelInExecutionForbiddenError } from '../../../domain/errors/cancel-in-execution-forbidden.error';
import { WorkOrderNotFoundError } from '../../../domain/errors/work-order-not-found.error';
import { WorkOrderCanceled } from '../../../domain/events/work-order-canceled.event';
import { WorkOrderStatusChanged } from '../../../domain/events/work-order-status-changed.event';
import { PlannedQuantity } from '../../../domain/value-objects/planned-quantity';
import { WorkOrderId } from '../../../domain/value-objects/work-order-id';
import { WorkOrderItemId } from '../../../domain/value-objects/work-order-item-id';
import { WorkOrderNumber } from '../../../domain/value-objects/work-order-number';
import { WorkOrderStatus } from '../../../domain/work-order-status';
import { OutboxSettings } from '../../outbox-settings';
import { StockStepKind } from '../../ports/pending-stock-steps.port';
import { ActorCapabilities } from '../../ports/work-order-actors.port';
import { CancellationAuthorizer } from '../../services/cancellation.authorizer';
import { StockStepApplier } from '../../services/stock-step-applier';
import { CancelWorkOrderCommand } from './cancel-work-order.command';
import { CancelWorkOrderUseCase } from './cancel-work-order.use-case';

const CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';
const VEHICLE_ID = '33333333-3333-4333-8333-333333333333';
const CREATOR_ID = '44444444-4444-4444-8444-444444444444';
const ACTOR_ID = '99999999-9999-4999-8999-999999999999';
const ITEM_ID = WorkOrderItemId.create('66666666-6666-4666-8666-666666666666');
const INVENTORY_ITEM_ID = '77777777-7777-4777-8777-777777777777';
const NUMBER = 'A1B090-2026';
const NOW = new Date('2026-08-31T12:00:00.000Z');
// The first id `FakeIdGenerator` hands out, which the use case draws as the write-off step's operation id.
const OPERATION_ID = '00000000-0000-4000-8000-000000000001';

function partItem(withdrawnQuantity: number): WorkOrderPartItem {
  return WorkOrderPartItem.restore({
    id: ITEM_ID,
    inventoryItemId: INVENTORY_ITEM_ID,
    sku: 'FLT-001',
    itemName: 'Filtro de oleo',
    unitPrice: Money.fromCents(2500),
    plannedQuantity: PlannedQuantity.create(3),
    withdrawnQuantity,
    budgetRound: null,
    budgetedUnitPrice: null,
  });
}

function restoreInExecution(withdrawnQuantity: number): WorkOrder {
  return WorkOrder.restore({
    id: WorkOrderId.create('11111111-1111-4111-8111-111111111111'),
    number: WorkOrderNumber.create(NUMBER),
    customerId: CUSTOMER_ID,
    vehicleId: VEHICLE_ID,
    assignedMechanicUserId: null,
    createdByUserId: CREATOR_ID,
    status: WorkOrderStatus.InExecution,
    customerName: 'Jane Doe',
    vehiclePlate: 'ABC1234',
    vehicleBrand: 'Toyota',
    vehicleModel: 'Corolla',
    vehicleYear: 2020,
    createdAt: NOW,
    updatedAt: NOW,
    serviceItems: [],
    partItems: [partItem(withdrawnQuantity)],
    diagnosisStartedAt: NOW,
    diagnosisCompletedAt: NOW,
    budgets: [],
    budgetDecidedAt: null,
    budgetDecidedByUserId: null,
    executionStartedAt: NOW,
  });
}

function makeAuthorizer(capabilities: Partial<ActorCapabilities>): CancellationAuthorizer {
  return new CancellationAuthorizer(
    new FakeWorkOrderActors().withCapabilities(ACTOR_ID, capabilities),
  );
}

// The use case reaches the work order repository, the outbox and the event publisher through
// `transactionRunner.watch`, which records the calls in order and tells which of them ran while the
// transaction was open. The applier works on the plain fakes, so the ledger call it makes shows
// whether it ran inside the transaction.
function makeUseCase(authorizer: CancellationAuthorizer, refusal?: Error) {
  const transactionRunner = new FakeTransactionRunner();
  const workOrders = new InMemoryWorkOrderRepository(() => transactionRunner.active);
  const stockLedger = new FakeStockLedger(() => transactionRunner.active);
  if (refusal) {
    stockLedger.refuseWith(refusal);
  }
  const clock = new FakeClock(NOW);
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
  const useCase = new CancelWorkOrderUseCase(
    transactionRunner.watch('workOrders', workOrders),
    transactionRunner,
    authorizer,
    new FakeIdGenerator(),
    clock,
    transactionRunner.watch('steps', steps),
    applier,
    transactionRunner.watch('events', events),
  );
  return { useCase, workOrders, transactionRunner, stockLedger, steps, clock, events };
}

describe('CancelWorkOrderUseCase', () => {
  it('refuses an unknown work order with WorkOrderNotFoundError', async () => {
    const authorizer = makeAuthorizer({});
    const { useCase, workOrders, events, steps } = makeUseCase(authorizer);

    await expect(
      useCase.execute(new CancelWorkOrderCommand('ZZZZZZ-2026', 'x', ACTOR_ID)),
    ).rejects.toThrow(WorkOrderNotFoundError);
    expect(workOrders.workOrders).toHaveLength(0);
    expect(events.published).toHaveLength(0);
    expect(steps.stored.size).toBe(0);
  });

  it('refuses an actor the authorizer refuses, and never reaches save', async () => {
    const authorizer = makeAuthorizer({});
    const { useCase, workOrders, transactionRunner, stockLedger, steps, events } =
      makeUseCase(authorizer);
    await workOrders.save(restoreInExecution(2));

    await expect(
      useCase.execute(new CancelWorkOrderCommand(NUMBER, 'Cliente desistiu', ACTOR_ID)),
    ).rejects.toThrow(CancelInExecutionForbiddenError);
    expect(transactionRunner.runCalls).toBe(0);
    expect(workOrders.workOrders[0].status).toBe(WorkOrderStatus.InExecution);
    expect(stockLedger.writtenOff).toHaveLength(0);
    expect(steps.stored.size).toBe(0);
    expect(events.published).toHaveLength(0);
  });

  it('saves the work order and records the write-off step in one transaction', async () => {
    const authorizer = makeAuthorizer({ cancelsInExecution: true });
    const { useCase, workOrders, transactionRunner, steps } = makeUseCase(authorizer);
    await workOrders.save(restoreInExecution(2));

    await useCase.execute(new CancelWorkOrderCommand(NUMBER, 'Cliente desistiu', ACTOR_ID));

    expect(transactionRunner.runCalls).toBe(1);
    expect(transactionRunner.callsInside).toEqual(['workOrders.save', 'steps.enqueue']);
    expect(workOrders.workOrders[0].status).toBe(WorkOrderStatus.Canceled);
    expect(workOrders.savedInsideTransaction).toEqual([NUMBER]);
    expect(steps.stateOf(OPERATION_ID).step).toEqual({
      operationId: OPERATION_ID,
      kind: StockStepKind.WriteOff,
      workOrderId: workOrders.workOrders[0].id.value,
      actorUserId: ACTOR_ID,
    });
  });

  it('writes the stock off through the ledger after the commit, for the actor, and completes the step', async () => {
    const authorizer = makeAuthorizer({ cancelsInExecution: true });
    const { useCase, workOrders, stockLedger, steps } = makeUseCase(authorizer);
    await workOrders.save(restoreInExecution(2));

    await useCase.execute(new CancelWorkOrderCommand(NUMBER, 'Cliente desistiu', ACTOR_ID));

    expect(stockLedger.writtenOff).toEqual([
      {
        workOrderId: workOrders.workOrders[0].id.value,
        actorUserId: ACTOR_ID,
        insideTransaction: false,
      },
    ]);
    expect(steps.stateOf(OPERATION_ID)).toMatchObject({ status: 'DONE', attempts: 1 });
  });

  it('still records the write-off step for a work order with no outstanding withdrawn part (spec.md edge case)', async () => {
    const authorizer = makeAuthorizer({});
    const { useCase, workOrders, stockLedger } = makeUseCase(authorizer);
    await workOrders.save(restoreInExecution(0));

    await useCase.execute(new CancelWorkOrderCommand(NUMBER, 'Cliente desistiu', ACTOR_ID));

    expect(stockLedger.writtenOff).toEqual([
      {
        workOrderId: workOrders.workOrders[0].id.value,
        actorUserId: ACTOR_ID,
        insideTransaction: false,
      },
    ]);
  });

  it('answers with the saved work order when the ledger fails, leaving the step pending with the error and the wait for the processor', async () => {
    const authorizer = makeAuthorizer({ cancelsInExecution: true });
    const { useCase, workOrders, steps, clock, events } = makeUseCase(
      authorizer,
      new Error('boom'),
    );
    await workOrders.save(restoreInExecution(2));

    await expect(
      useCase.execute(new CancelWorkOrderCommand(NUMBER, 'Cliente desistiu', ACTOR_ID)),
    ).resolves.toBeUndefined();

    expect(workOrders.workOrders[0].status).toBe(WorkOrderStatus.Canceled);
    expect(steps.stateOf(OPERATION_ID)).toMatchObject({
      status: 'PENDING',
      attempts: 1,
      lastError: 'boom',
      dueAt: new Date(clock.now().getTime() + 1000),
    });
    expect(events.published).toHaveLength(2);
  });

  it('answers with the saved work order when the claim of the step fails, leaving the step pending', async () => {
    const authorizer = makeAuthorizer({ cancelsInExecution: true });
    const { useCase, workOrders, stockLedger, steps, events } = makeUseCase(authorizer);
    await workOrders.save(restoreInExecution(2));
    steps.claimDue = () => Promise.reject(new Error('the database is down'));

    await expect(
      useCase.execute(new CancelWorkOrderCommand(NUMBER, 'Cliente desistiu', ACTOR_ID)),
    ).resolves.toBeUndefined();

    expect(workOrders.workOrders[0].status).toBe(WorkOrderStatus.Canceled);
    expect(stockLedger.writtenOff).toEqual([]);
    expect(steps.stateOf(OPERATION_ID)).toMatchObject({ status: 'PENDING', attempts: 0 });
    expect(events.published).toHaveLength(2);
  });

  it('publishes the recorded events after the transaction', async () => {
    const authorizer = makeAuthorizer({});
    const { useCase, workOrders, clock, events, transactionRunner } = makeUseCase(authorizer);
    await workOrders.save(restoreInExecution(0));

    await useCase.execute(new CancelWorkOrderCommand(NUMBER, 'Cliente desistiu', ACTOR_ID));

    expect(events.published).toEqual([
      new WorkOrderCanceled(
        workOrders.workOrders[0].id.value,
        ACTOR_ID,
        WorkOrderStatus.InExecution,
        clock.now(),
      ),
      new WorkOrderStatusChanged(
        workOrders.workOrders[0].id.value,
        NUMBER,
        CUSTOMER_ID,
        'ABC1234',
        WorkOrderStatus.InExecution,
        WorkOrderStatus.Canceled,
        null,
        clock.now(),
      ),
    ]);
    expect(transactionRunner.callsInside).not.toContain('events.publish');
  });
});
