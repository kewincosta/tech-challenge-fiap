import { describe, expect, it } from 'vitest';
import { stubEventBus } from '../../../../../../test/support/fakes/bus.stubs';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { FakeIdGenerator } from '../../../../../../test/support/fakes/fake-id-generator';
import { InMemoryWorkOrderRepository } from '../../../../../../test/support/fakes/in-memory-work-order.repository';
import { Money } from '../../../../../shared/domain/value-objects/money';
import { BudgetStatus } from '../../../domain/budget-status';
import { Budget } from '../../../domain/entities/budget';
import { WorkOrder } from '../../../domain/entities/work-order';
import { WorkOrderServiceItem } from '../../../domain/entities/work-order-service-item';
import { EmptyDraftBudgetError } from '../../../domain/errors/empty-draft-budget.error';
import { WorkOrderNotFoundError } from '../../../domain/errors/work-order-not-found.error';
import { WorkOrderStateError } from '../../../domain/errors/work-order-state.error';
import { BudgetId } from '../../../domain/value-objects/budget-id';
import { WorkOrderId } from '../../../domain/value-objects/work-order-id';
import { WorkOrderItemId } from '../../../domain/value-objects/work-order-item-id';
import { WorkOrderNumber } from '../../../domain/value-objects/work-order-number';
import { WorkOrderStatus } from '../../../domain/work-order-status';
import { SubmitSupplementaryBudgetCommand } from './submit-supplementary-budget.command';
import { SubmitSupplementaryBudgetHandler } from './submit-supplementary-budget.handler';

const CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';
const VEHICLE_ID = '33333333-3333-4333-8333-333333333333';
const CREATOR_ID = '44444444-4444-4444-8444-444444444444';
const NUMBER = 'A1B090-2026';
const NOW = new Date('2026-08-31T12:00:00.000Z');

function approvedRoundOne(): Budget {
  return Budget.restore({
    id: BudgetId.create('88888888-8888-4888-8888-888888888888'),
    round: 1,
    total: Money.fromCents(15099),
    status: BudgetStatus.Approved,
    generatedAt: NOW,
    decidedAt: NOW,
    decidedByUserId: CUSTOMER_ID,
  });
}

function attachedServiceItem(): WorkOrderServiceItem {
  return WorkOrderServiceItem.restore({
    id: WorkOrderItemId.create('66666666-6666-4666-8666-666666666666'),
    serviceId: '77777777-7777-4777-8777-777777777777',
    serviceName: 'Troca de oleo',
    unitPrice: Money.fromCents(15099),
    budgetRound: 1,
    budgetedUnitPrice: Money.fromCents(15099),
  });
}

function draftServiceItem(): WorkOrderServiceItem {
  return WorkOrderServiceItem.add({
    id: WorkOrderItemId.create('99999999-9999-4999-8999-999999999999'),
    serviceId: '77777777-7777-4777-8777-777777777777',
    serviceName: 'Alinhamento',
    unitPrice: Money.fromCents(8000),
  });
}

function restoreInExecution(withDraft: boolean): WorkOrder {
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
    serviceItems: withDraft ? [attachedServiceItem(), draftServiceItem()] : [attachedServiceItem()],
    partItems: [],
    diagnosisStartedAt: NOW,
    diagnosisCompletedAt: NOW,
    budgets: [approvedRoundOne()],
    budgetDecidedAt: NOW,
    budgetDecidedByUserId: CUSTOMER_ID,
    executionStartedAt: NOW,
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

function makeHandler() {
  const workOrders = new InMemoryWorkOrderRepository();
  const eventBus = stubEventBus();
  const handler = new SubmitSupplementaryBudgetHandler(
    workOrders,
    new FakeIdGenerator(),
    new FakeClock(),
    eventBus.bus,
  );
  return { handler, workOrders, eventBus };
}

describe('SubmitSupplementaryBudgetHandler', () => {
  it('mints a BudgetId, generates round two over the draft, and publishes both recorded events', async () => {
    const { handler, workOrders, eventBus } = makeHandler();
    await workOrders.save(restoreInExecution(true));

    await handler.execute(new SubmitSupplementaryBudgetCommand(NUMBER, CREATOR_ID));

    const updated = workOrders.workOrders[0];
    expect(updated.status).toBe(WorkOrderStatus.AwaitingApproval);
    expect(updated.budgets).toHaveLength(2);
    expect(eventBus.publishAll).toHaveBeenCalledTimes(1);
    expect((eventBus.publishAll.mock.calls[0] as unknown[][])[0]).toHaveLength(2);
  });

  it('refuses an unknown work order with WorkOrderNotFoundError', async () => {
    const { handler, workOrders } = makeHandler();

    await expect(
      handler.execute(new SubmitSupplementaryBudgetCommand('ZZZZZZ-2026', CREATOR_ID)),
    ).rejects.toThrow(WorkOrderNotFoundError);
    expect(workOrders.workOrders).toHaveLength(0);
  });

  it('lets EmptyDraftBudgetError travel out untouched', async () => {
    const { handler, workOrders } = makeHandler();
    await workOrders.save(restoreInExecution(false));

    await expect(
      handler.execute(new SubmitSupplementaryBudgetCommand(NUMBER, CREATOR_ID)),
    ).rejects.toThrow(EmptyDraftBudgetError);
  });

  it("lets the aggregate's wrong-state error travel out untouched", async () => {
    const { handler, workOrders } = makeHandler();
    await workOrders.save(buildReceivedWorkOrder());

    await expect(
      handler.execute(new SubmitSupplementaryBudgetCommand(NUMBER, CREATOR_ID)),
    ).rejects.toThrow(WorkOrderStateError);
  });
});
