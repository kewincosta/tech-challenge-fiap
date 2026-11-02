import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { FakeWorkOrderActors } from '../../../../../../test/support/fakes/fake-work-order-actors';
import { InMemoryWorkOrderRepository } from '../../../../../../test/support/fakes/in-memory-work-order.repository';
import { RecordingDomainEventPublisher } from '../../../../../../test/support/fakes/recording-domain-event-publisher';
import { Money } from '../../../../../shared/domain/value-objects/money';
import { BudgetStatus } from '../../../domain/budget-status';
import { Budget } from '../../../domain/entities/budget';
import { WorkOrder } from '../../../domain/entities/work-order';
import { WorkOrderServiceItem } from '../../../domain/entities/work-order-service-item';
import { CompletionForbiddenError } from '../../../domain/errors/completion-forbidden.error';
import { DiscountExceedsChargedTotalError } from '../../../domain/errors/discount-exceeds-charged-total.error';
import { WorkOrderNotFoundError } from '../../../domain/errors/work-order-not-found.error';
import { WorkOrderStateError } from '../../../domain/errors/work-order-state.error';
import { WorkOrderCompleted } from '../../../domain/events/work-order-completed.event';
import { WorkOrderStatusChanged } from '../../../domain/events/work-order-status-changed.event';
import { BudgetId } from '../../../domain/value-objects/budget-id';
import { WorkOrderId } from '../../../domain/value-objects/work-order-id';
import { WorkOrderItemId } from '../../../domain/value-objects/work-order-item-id';
import { WorkOrderNumber } from '../../../domain/value-objects/work-order-number';
import { WorkOrderStatus } from '../../../domain/work-order-status';
import { WorkOrderCompletionAuthorizer } from '../../services/work-order-completion.authorizer';
import { CompleteWorkOrderCommand } from './complete-work-order.command';
import { CompleteWorkOrderUseCase } from './complete-work-order.use-case';

const CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';
const VEHICLE_ID = '33333333-3333-4333-8333-333333333333';
const CREATOR_ID = '44444444-4444-4444-8444-444444444444';
const MECHANIC_ID = '55555555-5555-4555-8555-555555555555';
const NUMBER = 'A1B090-2026';
const NOW = new Date('2026-08-31T12:00:00.000Z');

/** Nobody of these tests holds the management capability, so the assignment decides. */
function makeAuthorizer(): WorkOrderCompletionAuthorizer {
  return new WorkOrderCompletionAuthorizer(new FakeWorkOrderActors());
}

function restoreInExecution(
  overrides: { discount?: Money; status?: WorkOrderStatus } = {},
): WorkOrder {
  const budget = Budget.restore({
    id: BudgetId.create('88888888-8888-4888-8888-888888888888'),
    round: 1,
    total: Money.fromCents(15099),
    status: BudgetStatus.Approved,
    generatedAt: NOW,
    decidedAt: NOW,
    decidedByUserId: CUSTOMER_ID,
  });
  const item = WorkOrderServiceItem.restore({
    id: WorkOrderItemId.create('66666666-6666-4666-8666-666666666666'),
    serviceId: '77777777-7777-4777-8777-777777777777',
    serviceName: 'Troca de oleo',
    unitPrice: Money.fromCents(15099),
    budgetRound: 1,
    budgetedUnitPrice: Money.fromCents(15099),
  });
  return WorkOrder.restore({
    id: WorkOrderId.create('11111111-1111-4111-8111-111111111111'),
    number: WorkOrderNumber.create(NUMBER),
    customerId: CUSTOMER_ID,
    vehicleId: VEHICLE_ID,
    assignedMechanicUserId: MECHANIC_ID,
    createdByUserId: CREATOR_ID,
    status: overrides.status ?? WorkOrderStatus.InExecution,
    customerName: 'Jane Doe',
    vehiclePlate: 'ABC1234',
    vehicleBrand: 'Toyota',
    vehicleModel: 'Corolla',
    vehicleYear: 2020,
    createdAt: NOW,
    updatedAt: NOW,
    serviceItems: [item],
    partItems: [],
    diagnosisStartedAt: NOW,
    diagnosisCompletedAt: NOW,
    budgets: [budget],
    budgetDecidedAt: NOW,
    budgetDecidedByUserId: CUSTOMER_ID,
    executionStartedAt: NOW,
    discount: overrides.discount,
  });
}

function makeUseCase(authorizer: WorkOrderCompletionAuthorizer) {
  const workOrders = new InMemoryWorkOrderRepository();
  const clock = new FakeClock(NOW);
  const events = new RecordingDomainEventPublisher();
  const useCase = new CompleteWorkOrderUseCase(workOrders, authorizer, clock, events);
  return { useCase, workOrders, clock, events };
}

describe('CompleteWorkOrderUseCase', () => {
  it('completes the work order and publishes the recorded event when the authorizer admits the actor', async () => {
    const authorizer = makeAuthorizer();
    const { useCase, workOrders, clock, events } = makeUseCase(authorizer);
    await workOrders.save(restoreInExecution());

    await useCase.execute(new CompleteWorkOrderCommand(NUMBER, MECHANIC_ID));

    const updated = workOrders.workOrders[0];
    expect(updated.status).toBe(WorkOrderStatus.Completed);
    expect(events.published).toEqual([
      new WorkOrderCompleted(updated.id.value, MECHANIC_ID, clock.now()),
      new WorkOrderStatusChanged(
        updated.id.value,
        NUMBER,
        CUSTOMER_ID,
        'ABC1234',
        WorkOrderStatus.InExecution,
        WorkOrderStatus.Completed,
        null,
        clock.now(),
      ),
    ]);
  });

  it('refuses an unknown work order before the authorizer is consulted', async () => {
    const authorizer = makeAuthorizer();
    const { useCase, workOrders, events } = makeUseCase(authorizer);

    await expect(
      useCase.execute(new CompleteWorkOrderCommand('ZZZZZZ-2026', MECHANIC_ID)),
    ).rejects.toThrow(WorkOrderNotFoundError);
    expect(workOrders.workOrders).toHaveLength(0);
    expect(events.published).toHaveLength(0);
  });

  it('refuses an actor the authorizer refuses, and never reaches save', async () => {
    const authorizer = makeAuthorizer();
    const { useCase, workOrders, events } = makeUseCase(authorizer);
    await workOrders.save(restoreInExecution());
    const otherMechanicId = '66666666-6666-4666-8666-666666666666';

    await expect(
      useCase.execute(new CompleteWorkOrderCommand(NUMBER, otherMechanicId)),
    ).rejects.toThrow(CompletionForbiddenError);
    expect(workOrders.workOrders[0].status).toBe(WorkOrderStatus.InExecution);
    expect(events.published).toHaveLength(0);
  });

  it("lets the aggregate's wrong-state error travel out untouched", async () => {
    const authorizer = makeAuthorizer();
    const { useCase, workOrders, events } = makeUseCase(authorizer);
    await workOrders.save(restoreInExecution({ status: WorkOrderStatus.AwaitingApproval }));

    await expect(
      useCase.execute(new CompleteWorkOrderCommand(NUMBER, MECHANIC_ID)),
    ).rejects.toThrow(WorkOrderStateError);
    expect(events.published).toHaveLength(0);
  });

  it("lets the aggregate's discount-exceeds-total error travel out untouched", async () => {
    const authorizer = makeAuthorizer();
    const { useCase, workOrders, events } = makeUseCase(authorizer);
    await workOrders.save(restoreInExecution({ discount: Money.fromCents(999999) }));

    await expect(
      useCase.execute(new CompleteWorkOrderCommand(NUMBER, MECHANIC_ID)),
    ).rejects.toThrow(DiscountExceedsChargedTotalError);
    expect(events.published).toHaveLength(0);
  });
});
