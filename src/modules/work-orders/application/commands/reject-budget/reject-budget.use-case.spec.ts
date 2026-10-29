import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { FakeCustomerDirectory } from '../../../../../../test/support/fakes/fake-customer-directory';
import { FakeWorkOrderActors } from '../../../../../../test/support/fakes/fake-work-order-actors';
import { InMemoryWorkOrderRepository } from '../../../../../../test/support/fakes/in-memory-work-order.repository';
import { RecordingDomainEventPublisher } from '../../../../../../test/support/fakes/recording-domain-event-publisher';
import { Money } from '../../../../../shared/domain/value-objects/money';
import { BudgetStatus } from '../../../domain/budget-status';
import { Budget } from '../../../domain/entities/budget';
import { WorkOrder } from '../../../domain/entities/work-order';
import { WorkOrderServiceItem } from '../../../domain/entities/work-order-service-item';
import { WorkOrderNotFoundError } from '../../../domain/errors/work-order-not-found.error';
import { WorkOrderStateError } from '../../../domain/errors/work-order-state.error';
import { BudgetRejected } from '../../../domain/events/budget-rejected.event';
import { ExecutionStarted } from '../../../domain/events/execution-started.event';
import { BudgetId } from '../../../domain/value-objects/budget-id';
import { WorkOrderId } from '../../../domain/value-objects/work-order-id';
import { WorkOrderItemId } from '../../../domain/value-objects/work-order-item-id';
import { WorkOrderNumber } from '../../../domain/value-objects/work-order-number';
import { WorkOrderStatus } from '../../../domain/work-order-status';
import { ActorCapabilities } from '../../ports/work-order-actors.port';
import { BudgetDecisionAuthorizer } from '../../services/budget-decision.authorizer';
import { RejectBudgetCommand } from './reject-budget.command';
import { RejectBudgetUseCase } from './reject-budget.use-case';

const CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';
const VEHICLE_ID = '33333333-3333-4333-8333-333333333333';
const CREATOR_ID = '44444444-4444-4444-8444-444444444444';
const CUSTOMER_ACTOR_ID = '55555555-5555-4555-8555-555555555555';
const NUMBER = 'A1B090-2026';
const NOW = new Date('2026-08-31T12:00:00.000Z');
const EXECUTION_START = new Date('2026-08-30T09:00:00.000Z');

/** The actor holds the capabilities listed and, when one is given, is a customer of `customerOfActor`. */
function makeAuthorizer(
  capabilities: Partial<ActorCapabilities>,
  customerOfActor: string | null,
): BudgetDecisionAuthorizer {
  const actors = new FakeWorkOrderActors().withCapabilities(CUSTOMER_ACTOR_ID, capabilities);
  const customers = new FakeCustomerDirectory();
  if (customerOfActor) {
    customers.add({ id: customerOfActor, name: 'Jane Doe', active: true }, CUSTOMER_ACTOR_ID);
  }
  return new BudgetDecisionAuthorizer(actors, customers);
}

function restoreAwaitingApproval(round: number, executionStartedAt: Date | null): WorkOrder {
  const budget = Budget.restore({
    id: BudgetId.create('88888888-8888-4888-8888-888888888888'),
    round,
    total: Money.fromCents(15099),
    status: BudgetStatus.Pending,
    generatedAt: NOW,
    decidedAt: null,
    decidedByUserId: null,
  });
  const item = WorkOrderServiceItem.restore({
    id: WorkOrderItemId.create('66666666-6666-4666-8666-666666666666'),
    serviceId: '77777777-7777-4777-8777-777777777777',
    serviceName: 'Troca de oleo',
    unitPrice: Money.fromCents(15099),
    budgetRound: round,
    budgetedUnitPrice: Money.fromCents(15099),
  });
  return WorkOrder.restore({
    id: WorkOrderId.create('11111111-1111-4111-8111-111111111111'),
    number: WorkOrderNumber.create(NUMBER),
    customerId: CUSTOMER_ID,
    vehicleId: VEHICLE_ID,
    assignedMechanicUserId: null,
    createdByUserId: CREATOR_ID,
    status: WorkOrderStatus.AwaitingApproval,
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
    budgetDecidedAt: null,
    budgetDecidedByUserId: null,
    executionStartedAt,
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
    now: NOW,
  });
}

function makeUseCase(authorizer: BudgetDecisionAuthorizer) {
  const workOrders = new InMemoryWorkOrderRepository();
  const clock = new FakeClock();
  const events = new RecordingDomainEventPublisher();
  const useCase = new RejectBudgetUseCase(workOrders, authorizer, clock, events);
  return { useCase, workOrders, clock, events };
}

describe('RejectBudgetUseCase', () => {
  it('rejects round one and returns the work order to IN_DIAGNOSIS, publishing one event', async () => {
    const authorizer = makeAuthorizer({}, CUSTOMER_ID);
    const { useCase, workOrders, clock, events } = makeUseCase(authorizer);
    await workOrders.save(restoreAwaitingApproval(1, null));

    await useCase.execute(new RejectBudgetCommand(NUMBER, CUSTOMER_ACTOR_ID));

    const updated = workOrders.workOrders[0];
    expect(updated.status).toBe(WorkOrderStatus.InDiagnosis);
    expect(events.published).toEqual([
      new BudgetRejected(
        updated.id.value,
        CUSTOMER_ACTOR_ID,
        WorkOrderStatus.InDiagnosis,
        clock.now(),
      ),
    ]);
  });

  it('rejects a round above one and returns to IN_EXECUTION, publishing two events (a different set than round one)', async () => {
    const authorizer = makeAuthorizer({}, CUSTOMER_ID);
    const { useCase, workOrders, clock, events } = makeUseCase(authorizer);
    await workOrders.save(restoreAwaitingApproval(2, EXECUTION_START));

    await useCase.execute(new RejectBudgetCommand(NUMBER, CUSTOMER_ACTOR_ID));

    const updated = workOrders.workOrders[0];
    expect(updated.status).toBe(WorkOrderStatus.InExecution);
    expect(events.published).toEqual([
      new BudgetRejected(
        updated.id.value,
        CUSTOMER_ACTOR_ID,
        WorkOrderStatus.InExecution,
        clock.now(),
      ),
      new ExecutionStarted(updated.id.value, CUSTOMER_ACTOR_ID, clock.now()),
    ]);
  });

  it('refuses an actor the authorizer refuses, and never reaches save', async () => {
    const otherCustomerId = '66666666-6666-4666-8666-666666666666';
    const authorizer = makeAuthorizer({}, otherCustomerId);
    const { useCase, workOrders, events } = makeUseCase(authorizer);
    await workOrders.save(restoreAwaitingApproval(1, null));

    await expect(
      useCase.execute(new RejectBudgetCommand(NUMBER, CUSTOMER_ACTOR_ID)),
    ).rejects.toThrow(WorkOrderNotFoundError);
    expect(workOrders.workOrders[0].status).toBe(WorkOrderStatus.AwaitingApproval);
    expect(events.published).toHaveLength(0);
  });

  it('refuses an unknown work order with WorkOrderNotFoundError', async () => {
    const authorizer = makeAuthorizer({}, null);
    const { useCase, workOrders, events } = makeUseCase(authorizer);

    await expect(
      useCase.execute(new RejectBudgetCommand('ZZZZZZ-2026', CUSTOMER_ACTOR_ID)),
    ).rejects.toThrow(WorkOrderNotFoundError);
    expect(workOrders.workOrders).toHaveLength(0);
    expect(events.published).toHaveLength(0);
  });

  it("lets the aggregate's wrong-state error travel out untouched", async () => {
    const authorizer = makeAuthorizer({ decidesAnyBudget: true }, null);
    const { useCase, workOrders, events } = makeUseCase(authorizer);
    await workOrders.save(buildReceivedWorkOrder());

    await expect(
      useCase.execute(new RejectBudgetCommand(NUMBER, CUSTOMER_ACTOR_ID)),
    ).rejects.toThrow(WorkOrderStateError);
    expect(events.published).toHaveLength(0);
  });
});
