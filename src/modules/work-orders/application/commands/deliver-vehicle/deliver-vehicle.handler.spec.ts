import { describe, expect, it } from 'vitest';
import { stubCommandBus, stubEventBus } from '../../../../../../test/support/fakes/bus.stubs';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { FakeTransactionRunner } from '../../../../../../test/support/fakes/fake-transaction-runner';
import { InMemoryWorkOrderRepository } from '../../../../../../test/support/fakes/in-memory-work-order.repository';
import { Money } from '../../../../../shared/domain/value-objects/money';
import { SettleStockMovementsCommand } from '../../../../inventory/application/commands/settle-stock-movements/settle-stock-movements.command';
import { WorkOrder } from '../../../domain/entities/work-order';
import { WorkOrderNotFoundError } from '../../../domain/errors/work-order-not-found.error';
import { WorkOrderStateError } from '../../../domain/errors/work-order-state.error';
import { WorkOrderId } from '../../../domain/value-objects/work-order-id';
import { WorkOrderNumber } from '../../../domain/value-objects/work-order-number';
import { WorkOrderStatus } from '../../../domain/work-order-status';
import { DeliverVehicleCommand } from './deliver-vehicle.command';
import { DeliverVehicleHandler } from './deliver-vehicle.handler';

const CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';
const VEHICLE_ID = '33333333-3333-4333-8333-333333333333';
const CREATOR_ID = '44444444-4444-4444-8444-444444444444';
const MECHANIC_ID = '55555555-5555-4555-8555-555555555555';
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

function makeHandler(commandBusExecute?: (command: unknown) => Promise<unknown>) {
  const workOrders = new InMemoryWorkOrderRepository();
  const transactionRunner = new FakeTransactionRunner();
  const commandBus = stubCommandBus();
  commandBus.execute.mockImplementation(commandBusExecute ?? (() => Promise.resolve(undefined)));
  const eventBus = stubEventBus();
  const handler = new DeliverVehicleHandler(
    workOrders,
    transactionRunner,
    new FakeClock(NOW),
    commandBus.bus,
    eventBus.bus,
  );
  return { handler, workOrders, transactionRunner, commandBus, eventBus };
}

describe('DeliverVehicleHandler', () => {
  it('refuses an unknown work order with WorkOrderNotFoundError', async () => {
    const { handler, workOrders } = makeHandler();

    await expect(handler.execute(new DeliverVehicleCommand('ZZZZZZ-2026', CREATOR_ID))).rejects.toThrow(
      WorkOrderNotFoundError,
    );
    expect(workOrders.workOrders).toHaveLength(0);
  });

  it('validates on the aggregate before opening the transaction, so a rejected delivery never starts one', async () => {
    const { handler, workOrders, transactionRunner } = makeHandler();
    await workOrders.save(restoreAt(WorkOrderStatus.InExecution));

    await expect(handler.execute(new DeliverVehicleCommand(NUMBER, CREATOR_ID))).rejects.toThrow(
      WorkOrderStateError,
    );
    expect(transactionRunner.runCalls).toBe(0);
  });

  it('opens exactly one transaction and saves the work order', async () => {
    const { handler, workOrders, transactionRunner } = makeHandler();
    await workOrders.save(restoreAt(WorkOrderStatus.Completed));

    await handler.execute(new DeliverVehicleCommand(NUMBER, CREATOR_ID));

    expect(transactionRunner.runCalls).toBe(1);
    expect(workOrders.workOrders[0].status).toBe(WorkOrderStatus.Delivered);
  });

  it('dispatches SettleStockMovementsCommand with the work order id and the actor', async () => {
    const { handler, workOrders, commandBus } = makeHandler();
    await workOrders.save(restoreAt(WorkOrderStatus.Completed));

    await handler.execute(new DeliverVehicleCommand(NUMBER, CREATOR_ID));

    expect(commandBus.execute).toHaveBeenCalledTimes(1);
    const dispatched = commandBus.execute.mock.calls[0][0] as SettleStockMovementsCommand;
    expect(dispatched).toBeInstanceOf(SettleStockMovementsCommand);
    expect(dispatched.workOrderId).toBe(workOrders.workOrders[0].id.value);
    expect(dispatched.actorUserId).toBe(CREATOR_ID);
  });

  it('publishes the recorded events after the transaction', async () => {
    const { handler, workOrders, eventBus } = makeHandler();
    await workOrders.save(restoreAt(WorkOrderStatus.Completed));

    await handler.execute(new DeliverVehicleCommand(NUMBER, CREATOR_ID));

    expect(eventBus.publishAll).toHaveBeenCalledTimes(1);
  });

  it('lets an error raised by the inventory side travel out untouched', async () => {
    const { handler, workOrders } = makeHandler(() => Promise.reject(new Error('boom')));
    await workOrders.save(restoreAt(WorkOrderStatus.Completed));

    await expect(handler.execute(new DeliverVehicleCommand(NUMBER, CREATOR_ID))).rejects.toThrow('boom');
  });
});
