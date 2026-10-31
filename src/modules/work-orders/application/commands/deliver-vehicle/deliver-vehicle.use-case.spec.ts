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
import { WorkOrder } from '../../../domain/entities/work-order';
import { WorkOrderNotFoundError } from '../../../domain/errors/work-order-not-found.error';
import { WorkOrderStateError } from '../../../domain/errors/work-order-state.error';
import { VehicleDelivered } from '../../../domain/events/vehicle-delivered.event';
import { WorkOrderId } from '../../../domain/value-objects/work-order-id';
import { WorkOrderNumber } from '../../../domain/value-objects/work-order-number';
import { WorkOrderStatus } from '../../../domain/work-order-status';
import { OutboxSettings } from '../../outbox-settings';
import { StockStepKind } from '../../ports/pending-stock-steps.port';
import { StockStepApplier } from '../../services/stock-step-applier';
import { DeliverVehicleCommand } from './deliver-vehicle.command';
import { DeliverVehicleUseCase } from './deliver-vehicle.use-case';

const CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';
const VEHICLE_ID = '33333333-3333-4333-8333-333333333333';
const CREATOR_ID = '44444444-4444-4444-8444-444444444444';
const MECHANIC_ID = '55555555-5555-4555-8555-555555555555';
const ACTOR_ID = '66666666-6666-4666-8666-666666666666';
const NUMBER = 'A1B090-2026';
const NOW = new Date('2026-08-31T12:00:00.000Z');
// The first id `FakeIdGenerator` hands out, which the use case draws as the settle step's operation id.
const OPERATION_ID = '00000000-0000-4000-8000-000000000001';

function restoreAt(status: WorkOrderStatus): WorkOrder {
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
    partItems: [],
    diagnosisStartedAt: NOW,
    diagnosisCompletedAt: NOW,
    budgets: [],
    budgetDecidedAt: NOW,
    budgetDecidedByUserId: CUSTOMER_ID,
    executionStartedAt: NOW,
    chargedTotal: Money.fromCents(20000),
    completedAt: NOW,
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
  const useCase = new DeliverVehicleUseCase(
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

describe('DeliverVehicleUseCase', () => {
  it('refuses an unknown work order with WorkOrderNotFoundError', async () => {
    const { useCase, workOrders, events, steps } = makeUseCase();

    await expect(
      useCase.execute(new DeliverVehicleCommand('ZZZZZZ-2026', CREATOR_ID)),
    ).rejects.toThrow(WorkOrderNotFoundError);
    expect(workOrders.workOrders).toHaveLength(0);
    expect(events.published).toHaveLength(0);
    expect(steps.stored.size).toBe(0);
  });

  it('validates on the aggregate before opening the transaction, so a rejected delivery never starts one', async () => {
    const { useCase, workOrders, transactionRunner, stockLedger, steps, events } = makeUseCase();
    await workOrders.save(restoreAt(WorkOrderStatus.InExecution));

    await expect(useCase.execute(new DeliverVehicleCommand(NUMBER, CREATOR_ID))).rejects.toThrow(
      WorkOrderStateError,
    );
    expect(transactionRunner.runCalls).toBe(0);
    expect(stockLedger.settled).toHaveLength(0);
    expect(steps.stored.size).toBe(0);
    expect(events.published).toHaveLength(0);
  });

  it('saves the work order and records the settle step in one transaction', async () => {
    const { useCase, workOrders, transactionRunner, steps } = makeUseCase();
    await workOrders.save(restoreAt(WorkOrderStatus.Completed));

    await useCase.execute(new DeliverVehicleCommand(NUMBER, CREATOR_ID));

    expect(transactionRunner.runCalls).toBe(1);
    expect(transactionRunner.callsInside).toEqual(['workOrders.save', 'steps.enqueue']);
    expect(workOrders.workOrders[0].status).toBe(WorkOrderStatus.Delivered);
    expect(workOrders.savedInsideTransaction).toEqual([NUMBER]);
    expect(steps.stateOf(OPERATION_ID).step).toEqual({
      operationId: OPERATION_ID,
      kind: StockStepKind.Settle,
      workOrderId: workOrders.workOrders[0].id.value,
      actorUserId: CREATOR_ID,
    });
  });

  it('settles the stock of the work order through the ledger after the commit, for the actor, and completes the step', async () => {
    const { useCase, workOrders, stockLedger, steps } = makeUseCase();
    await workOrders.save(restoreAt(WorkOrderStatus.Completed));

    await useCase.execute(new DeliverVehicleCommand(NUMBER, ACTOR_ID));

    expect(stockLedger.settled).toEqual([
      {
        workOrderId: workOrders.workOrders[0].id.value,
        actorUserId: ACTOR_ID,
        insideTransaction: false,
      },
    ]);
    expect(steps.stateOf(OPERATION_ID)).toMatchObject({ status: 'DONE', attempts: 1 });
  });

  it('publishes the recorded events after the transaction', async () => {
    const { useCase, workOrders, clock, events, transactionRunner } = makeUseCase();
    await workOrders.save(restoreAt(WorkOrderStatus.Completed));

    await useCase.execute(new DeliverVehicleCommand(NUMBER, CREATOR_ID));

    expect(events.published).toEqual([
      new VehicleDelivered(workOrders.workOrders[0].id.value, CREATOR_ID, clock.now()),
    ]);
    expect(transactionRunner.callsInside).not.toContain('events.publish');
  });

  it('answers with the saved work order when the ledger fails, leaving the step pending with the error and the wait for the processor', async () => {
    const { useCase, workOrders, steps, clock, events } = makeUseCase(new Error('boom'));
    await workOrders.save(restoreAt(WorkOrderStatus.Completed));

    await expect(
      useCase.execute(new DeliverVehicleCommand(NUMBER, CREATOR_ID)),
    ).resolves.toBeUndefined();

    expect(workOrders.workOrders[0].status).toBe(WorkOrderStatus.Delivered);
    expect(steps.stateOf(OPERATION_ID)).toMatchObject({
      status: 'PENDING',
      attempts: 1,
      lastError: 'boom',
      dueAt: new Date(clock.now().getTime() + 1000),
    });
    expect(events.published).toHaveLength(1);
  });

  it('answers with the saved work order when the claim of the step fails, leaving the step pending', async () => {
    const { useCase, workOrders, stockLedger, steps, events } = makeUseCase();
    await workOrders.save(restoreAt(WorkOrderStatus.Completed));
    steps.claimDue = () => Promise.reject(new Error('the database is down'));

    await expect(
      useCase.execute(new DeliverVehicleCommand(NUMBER, CREATOR_ID)),
    ).resolves.toBeUndefined();

    expect(workOrders.workOrders[0].status).toBe(WorkOrderStatus.Delivered);
    expect(stockLedger.settled).toEqual([]);
    expect(steps.stateOf(OPERATION_ID)).toMatchObject({ status: 'PENDING', attempts: 0 });
    expect(events.published).toHaveLength(1);
  });
});
