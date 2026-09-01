import { describe, expect, it } from 'vitest';
import { stubEventBus } from '../../../../../../test/support/fakes/bus.stubs';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { InMemoryWorkOrderRepository } from '../../../../../../test/support/fakes/in-memory-work-order.repository';
import { WorkOrder } from '../../../domain/entities/work-order';
import { WorkOrderNotFoundError } from '../../../domain/errors/work-order-not-found.error';
import { WorkOrderStateError } from '../../../domain/errors/work-order-state.error';
import { WorkOrderId } from '../../../domain/value-objects/work-order-id';
import { WorkOrderNumber } from '../../../domain/value-objects/work-order-number';
import { WorkOrderStatus } from '../../../domain/work-order-status';
import { StartDiagnosisCommand } from './start-diagnosis.command';
import { StartDiagnosisHandler } from './start-diagnosis.handler';

const CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';
const VEHICLE_ID = '33333333-3333-4333-8333-333333333333';
const CREATOR_ID = '44444444-4444-4444-8444-444444444444';
const MECHANIC_ID = '55555555-5555-4555-8555-555555555555';
const NUMBER = 'A1B090-2026';

function buildReceivedWorkOrder(): WorkOrder {
  return WorkOrder.open({
    id: WorkOrderId.create('11111111-1111-4111-8111-111111111111'),
    number: WorkOrderNumber.create(NUMBER),
    customerId: CUSTOMER_ID,
    vehicleId: VEHICLE_ID,
    createdByUserId: CREATOR_ID,
    customerName: 'Jane Doe',
    vehiclePlate: 'ABC1234',
    vehicleBrand: 'Toyota',
    vehicleModel: 'Corolla',
    vehicleYear: 2020,
    now: new Date('2026-08-31T12:00:00.000Z'),
  });
}

function buildDeliveredWorkOrder(): WorkOrder {
  return WorkOrder.restore({
    id: WorkOrderId.create('11111111-1111-4111-8111-111111111111'),
    number: WorkOrderNumber.create(NUMBER),
    customerId: CUSTOMER_ID,
    vehicleId: VEHICLE_ID,
    assignedMechanicUserId: null,
    createdByUserId: CREATOR_ID,
    status: WorkOrderStatus.Delivered,
    customerName: 'Jane Doe',
    vehiclePlate: 'ABC1234',
    vehicleBrand: 'Toyota',
    vehicleModel: 'Corolla',
    vehicleYear: 2020,
    createdAt: new Date(),
    updatedAt: new Date(),
    serviceItems: [],
    partItems: [],
    diagnosisStartedAt: null,
    diagnosisCompletedAt: null,
    budgets: [],
    budgetDecidedAt: null,
    budgetDecidedByUserId: null,
    executionStartedAt: null,
  });
}

function makeHandler() {
  const workOrders = new InMemoryWorkOrderRepository();
  const eventBus = stubEventBus();
  const handler = new StartDiagnosisHandler(workOrders, new FakeClock(), eventBus.bus);
  return { handler, workOrders, eventBus };
}

describe('StartDiagnosisHandler', () => {
  it('starts the diagnosis, saves, and publishes the recorded event', async () => {
    const { handler, workOrders, eventBus } = makeHandler();
    await workOrders.save(buildReceivedWorkOrder());

    await handler.execute(new StartDiagnosisCommand(NUMBER, MECHANIC_ID));

    const updated = workOrders.workOrders[0];
    expect(updated.status).toBe(WorkOrderStatus.InDiagnosis);
    expect(eventBus.publishAll).toHaveBeenCalledTimes(1);
  });

  it('refuses an unknown work order with WorkOrderNotFoundError', async () => {
    const { handler, workOrders } = makeHandler();

    await expect(
      handler.execute(new StartDiagnosisCommand('ZZZZZZ-2026', MECHANIC_ID)),
    ).rejects.toThrow(WorkOrderNotFoundError);
    expect(workOrders.workOrders).toHaveLength(0);
  });

  it("lets the aggregate's state error travel out untouched", async () => {
    const { handler, workOrders } = makeHandler();
    await workOrders.save(buildDeliveredWorkOrder());

    await expect(handler.execute(new StartDiagnosisCommand(NUMBER, MECHANIC_ID))).rejects.toThrow(
      WorkOrderStateError,
    );
  });

  it('saves nothing when the aggregate refuses', async () => {
    const { handler, workOrders } = makeHandler();
    await workOrders.save(buildDeliveredWorkOrder());

    await expect(handler.execute(new StartDiagnosisCommand(NUMBER, MECHANIC_ID))).rejects.toThrow();
    expect(workOrders.workOrders[0].status).toBe(WorkOrderStatus.Delivered);
  });
});
