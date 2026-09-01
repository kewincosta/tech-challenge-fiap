import { describe, expect, it } from 'vitest';
import { stubEventBus } from '../../../../../../test/support/fakes/bus.stubs';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { FakeIdGenerator } from '../../../../../../test/support/fakes/fake-id-generator';
import { InMemoryWorkOrderRepository } from '../../../../../../test/support/fakes/in-memory-work-order.repository';
import { Money } from '../../../../../shared/domain/value-objects/money';
import { WorkOrder } from '../../../domain/entities/work-order';
import { WorkOrderServiceItem } from '../../../domain/entities/work-order-service-item';
import { DiagnosisWithoutItemsError } from '../../../domain/errors/diagnosis-without-items.error';
import { WorkOrderNotFoundError } from '../../../domain/errors/work-order-not-found.error';
import { WorkOrderStateError } from '../../../domain/errors/work-order-state.error';
import { WorkOrderId } from '../../../domain/value-objects/work-order-id';
import { WorkOrderItemId } from '../../../domain/value-objects/work-order-item-id';
import { WorkOrderNumber } from '../../../domain/value-objects/work-order-number';
import { WorkOrderStatus } from '../../../domain/work-order-status';
import { CompleteDiagnosisCommand } from './complete-diagnosis.command';
import { CompleteDiagnosisHandler } from './complete-diagnosis.handler';

const CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';
const VEHICLE_ID = '33333333-3333-4333-8333-333333333333';
const CREATOR_ID = '44444444-4444-4444-8444-444444444444';
const NUMBER = 'A1B090-2026';

function restoreInDiagnosis(withItem: boolean): WorkOrder {
  return WorkOrder.restore({
    id: WorkOrderId.create('11111111-1111-4111-8111-111111111111'),
    number: WorkOrderNumber.create(NUMBER),
    customerId: CUSTOMER_ID,
    vehicleId: VEHICLE_ID,
    assignedMechanicUserId: null,
    createdByUserId: CREATOR_ID,
    status: WorkOrderStatus.InDiagnosis,
    customerName: 'Jane Doe',
    vehiclePlate: 'ABC1234',
    vehicleBrand: 'Toyota',
    vehicleModel: 'Corolla',
    vehicleYear: 2020,
    createdAt: new Date(),
    updatedAt: new Date(),
    serviceItems: withItem
      ? [
          WorkOrderServiceItem.restore({
            id: WorkOrderItemId.create('66666666-6666-4666-8666-666666666666'),
            serviceId: '77777777-7777-4777-8777-777777777777',
            serviceName: 'Troca de oleo',
            unitPrice: Money.fromCents(15099),
            budgetRound: null,
            budgetedUnitPrice: null,
          }),
        ]
      : [],
    partItems: [],
    diagnosisStartedAt: new Date(),
    diagnosisCompletedAt: null,
    budgets: [],
    budgetDecidedAt: null,
    budgetDecidedByUserId: null,
    executionStartedAt: null,
  });
}

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
    now: new Date(),
  });
}

function makeHandler() {
  const workOrders = new InMemoryWorkOrderRepository();
  const eventBus = stubEventBus();
  const handler = new CompleteDiagnosisHandler(
    workOrders,
    new FakeIdGenerator(),
    new FakeClock(),
    eventBus.bus,
  );
  return { handler, workOrders, eventBus };
}

describe('CompleteDiagnosisHandler', () => {
  it('mints a BudgetId, generates round one, and publishes all three recorded events', async () => {
    const { handler, workOrders, eventBus } = makeHandler();
    await workOrders.save(restoreInDiagnosis(true));

    await handler.execute(new CompleteDiagnosisCommand(NUMBER, CREATOR_ID));

    const updated = workOrders.workOrders[0];
    expect(updated.status).toBe(WorkOrderStatus.AwaitingApproval);
    expect(updated.budgets).toHaveLength(1);
    expect(updated.budgets[0].id.value).toBeTruthy();
    expect(eventBus.publishAll).toHaveBeenCalledTimes(1);
    expect((eventBus.publishAll.mock.calls[0] as unknown[][])[0]).toHaveLength(3);
  });

  it('refuses an unknown work order with WorkOrderNotFoundError', async () => {
    const { handler, workOrders } = makeHandler();

    await expect(
      handler.execute(new CompleteDiagnosisCommand('ZZZZZZ-2026', CREATOR_ID)),
    ).rejects.toThrow(WorkOrderNotFoundError);
    expect(workOrders.workOrders).toHaveLength(0);
  });

  it("lets DiagnosisWithoutItemsError travel out untouched", async () => {
    const { handler, workOrders } = makeHandler();
    await workOrders.save(restoreInDiagnosis(false));

    await expect(
      handler.execute(new CompleteDiagnosisCommand(NUMBER, CREATOR_ID)),
    ).rejects.toThrow(DiagnosisWithoutItemsError);
  });

  it("lets the aggregate's wrong-state error travel out untouched", async () => {
    const { handler, workOrders } = makeHandler();
    await workOrders.save(buildReceivedWorkOrder());

    await expect(
      handler.execute(new CompleteDiagnosisCommand(NUMBER, CREATOR_ID)),
    ).rejects.toThrow(WorkOrderStateError);
  });
});
