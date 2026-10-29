import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { FakeStockLedger } from '../../../../../../test/support/fakes/fake-stock-ledger';
import { FakeTransactionRunner } from '../../../../../../test/support/fakes/fake-transaction-runner';
import { InMemoryWorkOrderRepository } from '../../../../../../test/support/fakes/in-memory-work-order.repository';
import { RecordingDomainEventPublisher } from '../../../../../../test/support/fakes/recording-domain-event-publisher';
import { Money } from '../../../../../shared/domain/value-objects/money';
import { WorkOrder } from '../../../domain/entities/work-order';
import { WorkOrderNotFoundError } from '../../../domain/errors/work-order-not-found.error';
import { WorkOrderStateError } from '../../../domain/errors/work-order-state.error';
import { VehicleDelivered } from '../../../domain/events/vehicle-delivered.event';
import { WorkOrderId } from '../../../domain/value-objects/work-order-id';
import { WorkOrderNumber } from '../../../domain/value-objects/work-order-number';
import { WorkOrderStatus } from '../../../domain/work-order-status';
import { DeliverVehicleCommand } from './deliver-vehicle.command';
import { DeliverVehicleUseCase } from './deliver-vehicle.use-case';

const CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';
const VEHICLE_ID = '33333333-3333-4333-8333-333333333333';
const CREATOR_ID = '44444444-4444-4444-8444-444444444444';
const MECHANIC_ID = '55555555-5555-4555-8555-555555555555';
const ACTOR_ID = '66666666-6666-4666-8666-666666666666';
const NUMBER = 'A1B090-2026';
const NOW = new Date('2026-08-31T12:00:00.000Z');

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

function makeUseCase(refusal?: Error) {
  const transactionRunner = new FakeTransactionRunner();
  const workOrders = new InMemoryWorkOrderRepository(() => transactionRunner.active);
  const stockLedger = new FakeStockLedger(() => transactionRunner.active);
  if (refusal) {
    stockLedger.refuseWith(refusal);
  }
  const clock = new FakeClock(NOW);
  const events = new RecordingDomainEventPublisher();
  const useCase = new DeliverVehicleUseCase(
    workOrders,
    transactionRunner,
    clock,
    stockLedger,
    events,
  );
  return { useCase, workOrders, transactionRunner, stockLedger, clock, events };
}

describe('DeliverVehicleUseCase', () => {
  it('refuses an unknown work order with WorkOrderNotFoundError', async () => {
    const { useCase, workOrders, events } = makeUseCase();

    await expect(
      useCase.execute(new DeliverVehicleCommand('ZZZZZZ-2026', CREATOR_ID)),
    ).rejects.toThrow(WorkOrderNotFoundError);
    expect(workOrders.workOrders).toHaveLength(0);
    expect(events.published).toHaveLength(0);
  });

  it('validates on the aggregate before opening the transaction, so a rejected delivery never starts one', async () => {
    const { useCase, workOrders, transactionRunner, stockLedger, events } = makeUseCase();
    await workOrders.save(restoreAt(WorkOrderStatus.InExecution));

    await expect(useCase.execute(new DeliverVehicleCommand(NUMBER, CREATOR_ID))).rejects.toThrow(
      WorkOrderStateError,
    );
    expect(transactionRunner.runCalls).toBe(0);
    expect(stockLedger.settled).toHaveLength(0);
    expect(events.published).toHaveLength(0);
  });

  it('opens exactly one transaction and saves the work order', async () => {
    const { useCase, workOrders, transactionRunner } = makeUseCase();
    await workOrders.save(restoreAt(WorkOrderStatus.Completed));

    await useCase.execute(new DeliverVehicleCommand(NUMBER, CREATOR_ID));

    expect(transactionRunner.runCalls).toBe(1);
    expect(workOrders.workOrders[0].status).toBe(WorkOrderStatus.Delivered);
    expect(workOrders.savedInsideTransaction).toEqual([NUMBER]);
  });

  it('settles the stock of the work order through the ledger, for the actor', async () => {
    const { useCase, workOrders, stockLedger } = makeUseCase();
    await workOrders.save(restoreAt(WorkOrderStatus.Completed));

    await useCase.execute(new DeliverVehicleCommand(NUMBER, ACTOR_ID));

    expect(stockLedger.settled).toEqual([
      {
        workOrderId: workOrders.workOrders[0].id.value,
        actorUserId: ACTOR_ID,
        insideTransaction: true,
      },
    ]);
  });

  it('publishes the recorded events after the transaction', async () => {
    const { useCase, workOrders, clock, events } = makeUseCase();
    await workOrders.save(restoreAt(WorkOrderStatus.Completed));

    await useCase.execute(new DeliverVehicleCommand(NUMBER, CREATOR_ID));

    expect(events.published).toEqual([
      new VehicleDelivered(workOrders.workOrders[0].id.value, CREATOR_ID, clock.now()),
    ]);
  });

  it('lets an error raised by the inventory side travel out untouched', async () => {
    const { useCase, workOrders, stockLedger, events } = makeUseCase(new Error('boom'));
    await workOrders.save(restoreAt(WorkOrderStatus.Completed));

    await expect(useCase.execute(new DeliverVehicleCommand(NUMBER, CREATOR_ID))).rejects.toThrow(
      'boom',
    );
    expect(stockLedger.settled).toHaveLength(0);
    expect(events.published).toHaveLength(0);
  });
});
