import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { FakeIdGenerator } from '../../../../../../test/support/fakes/fake-id-generator';
import { InMemoryWorkOrderRepository } from '../../../../../../test/support/fakes/in-memory-work-order.repository';
import { RecordingDomainEventPublisher } from '../../../../../../test/support/fakes/recording-domain-event-publisher';
import { Money } from '../../../../../shared/domain/value-objects/money';
import { WorkOrder } from '../../../domain/entities/work-order';
import { WorkOrderServiceItem } from '../../../domain/entities/work-order-service-item';
import { DiagnosisWithoutItemsError } from '../../../domain/errors/diagnosis-without-items.error';
import { WorkOrderNotFoundError } from '../../../domain/errors/work-order-not-found.error';
import { WorkOrderStateError } from '../../../domain/errors/work-order-state.error';
import { BudgetGenerated } from '../../../domain/events/budget-generated.event';
import { BudgetSent } from '../../../domain/events/budget-sent.event';
import { WorkOrderStatusChanged } from '../../../domain/events/work-order-status-changed.event';
import { DiagnosisCompleted } from '../../../domain/events/diagnosis-completed.event';
import { WorkOrderId } from '../../../domain/value-objects/work-order-id';
import { WorkOrderItemId } from '../../../domain/value-objects/work-order-item-id';
import { WorkOrderNumber } from '../../../domain/value-objects/work-order-number';
import { WorkOrderStatus } from '../../../domain/work-order-status';
import { CompleteDiagnosisCommand } from './complete-diagnosis.command';
import { CompleteDiagnosisUseCase } from './complete-diagnosis.use-case';

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
  const workOrder = WorkOrder.open({
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
  // A work order read back from the repository carries no pending events.
  workOrder.pullDomainEvents();
  return workOrder;
}

function makeUseCase() {
  const workOrders = new InMemoryWorkOrderRepository();
  const clock = new FakeClock();
  const events = new RecordingDomainEventPublisher();
  const useCase = new CompleteDiagnosisUseCase(workOrders, new FakeIdGenerator(), clock, events);
  return { useCase, workOrders, clock, events };
}

describe('CompleteDiagnosisUseCase', () => {
  it('mints a BudgetId, generates round one, and publishes the recorded events', async () => {
    const { useCase, workOrders, clock, events } = makeUseCase();
    await workOrders.save(restoreInDiagnosis(true));

    await useCase.execute(new CompleteDiagnosisCommand(NUMBER, CREATOR_ID));

    const updated = workOrders.workOrders[0];
    expect(updated.status).toBe(WorkOrderStatus.AwaitingApproval);
    expect(updated.budgets).toHaveLength(1);
    expect(updated.budgets[0].id.value).toBeTruthy();
    expect(events.published).toEqual([
      new DiagnosisCompleted(updated.id.value, CREATOR_ID, clock.now()),
      new BudgetGenerated(updated.id.value, CREATOR_ID, clock.now()),
      new BudgetSent(updated.id.value, CREATOR_ID, clock.now()),
      new WorkOrderStatusChanged(
        updated.id.value,
        NUMBER,
        CUSTOMER_ID,
        'ABC1234',
        WorkOrderStatus.InDiagnosis,
        WorkOrderStatus.AwaitingApproval,
        {
          id: updated.budgets[0].id.value,
          totalCents: updated.budgets[0].total.cents,
          generatedAt: clock.now(),
        },
        clock.now(),
      ),
    ]);
  });

  it('refuses an unknown work order with WorkOrderNotFoundError', async () => {
    const { useCase, workOrders, events } = makeUseCase();

    await expect(
      useCase.execute(new CompleteDiagnosisCommand('ZZZZZZ-2026', CREATOR_ID)),
    ).rejects.toThrow(WorkOrderNotFoundError);
    expect(workOrders.workOrders).toHaveLength(0);
    expect(events.published).toHaveLength(0);
  });

  it('lets DiagnosisWithoutItemsError travel out untouched', async () => {
    const { useCase, workOrders, events } = makeUseCase();
    await workOrders.save(restoreInDiagnosis(false));

    await expect(useCase.execute(new CompleteDiagnosisCommand(NUMBER, CREATOR_ID))).rejects.toThrow(
      DiagnosisWithoutItemsError,
    );
    expect(events.published).toHaveLength(0);
  });

  it("lets the aggregate's wrong-state error travel out untouched", async () => {
    const { useCase, workOrders, events } = makeUseCase();
    await workOrders.save(buildReceivedWorkOrder());

    await expect(useCase.execute(new CompleteDiagnosisCommand(NUMBER, CREATOR_ID))).rejects.toThrow(
      WorkOrderStateError,
    );
    expect(events.published).toHaveLength(0);
  });
});
