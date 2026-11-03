import { describe, expect, it } from 'vitest';
import { FakeWorkOrderActors } from '../../../../../test/support/fakes/fake-work-order-actors';
import { Money } from '../../../../shared/domain/value-objects/money';
import { BudgetStatus } from '../../domain/budget-status';
import { Budget } from '../../domain/entities/budget';
import { WorkOrder } from '../../domain/entities/work-order';
import { WorkOrderPartItem } from '../../domain/entities/work-order-part-item';
import { CancelInExecutionForbiddenError } from '../../domain/errors/cancel-in-execution-forbidden.error';
import { BudgetId } from '../../domain/value-objects/budget-id';
import { PlannedQuantity } from '../../domain/value-objects/planned-quantity';
import { WorkOrderId } from '../../domain/value-objects/work-order-id';
import { WorkOrderItemId } from '../../domain/value-objects/work-order-item-id';
import { WorkOrderNumber } from '../../domain/value-objects/work-order-number';
import { WorkOrderStatus } from '../../domain/work-order-status';
import { CancellationAuthorizer } from './cancellation.authorizer';

const CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';
const VEHICLE_ID = '33333333-3333-4333-8333-333333333333';
const CREATOR_ID = '44444444-4444-4444-8444-444444444444';
const ACTOR_ID = '55555555-5555-4555-8555-555555555555';
const ITEM_ID = WorkOrderItemId.create('66666666-6666-4666-8666-666666666666');
const INVENTORY_ITEM_ID = '77777777-7777-4777-8777-777777777777';
const NOW = new Date('2026-08-31T12:00:00.000Z');

function partItem(withdrawnQuantity: number): WorkOrderPartItem {
  return WorkOrderPartItem.restore({
    id: ITEM_ID,
    inventoryItemId: INVENTORY_ITEM_ID,
    sku: 'FLT-001',
    itemName: 'Filtro de oleo',
    unitPrice: Money.fromCents(2500),
    plannedQuantity: PlannedQuantity.create(3),
    withdrawnQuantity,
    budgetRound: 1,
    budgetedUnitPrice: Money.fromCents(2500),
  });
}

function workOrder(status: WorkOrderStatus, withdrawnQuantity: number): WorkOrder {
  const budget = Budget.restore({
    id: BudgetId.create('88888888-8888-4888-8888-888888888888'),
    round: 1,
    total: Money.fromCents(7500),
    status: BudgetStatus.Approved,
    generatedAt: NOW,
    decidedAt: NOW,
    decidedByUserId: CUSTOMER_ID,
  });
  return WorkOrder.restore({
    id: WorkOrderId.create('11111111-1111-4111-8111-111111111111'),
    number: WorkOrderNumber.create('A1B090-2026'),
    customerId: CUSTOMER_ID,
    vehicleId: VEHICLE_ID,
    assignedMechanicUserId: null,
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
    partItems: [partItem(withdrawnQuantity)],
    diagnosisStartedAt: NOW,
    diagnosisCompletedAt: NOW,
    budgets: [budget],
    budgetDecidedAt: NOW,
    budgetDecidedByUserId: CUSTOMER_ID,
    executionStartedAt: NOW,
  });
}

describe('CancellationAuthorizer', () => {
  it('admits a work order with no outstanding withdrawal without ever asking who the actor is', async () => {
    const actors = new FakeWorkOrderActors();
    const authorizer = new CancellationAuthorizer(actors);

    await expect(
      authorizer.assertMayCancel(workOrder(WorkOrderStatus.InExecution, 0), ACTOR_ID),
    ).resolves.toBeUndefined();
    expect(actors.capabilityLookups).toEqual([]);
  });

  it('refuses an actor without the in-execution capability when the work order has an outstanding withdrawal', async () => {
    const authorizer = new CancellationAuthorizer(new FakeWorkOrderActors());

    await expect(
      authorizer.assertMayCancel(workOrder(WorkOrderStatus.InExecution, 2), ACTOR_ID),
    ).rejects.toThrow(CancelInExecutionForbiddenError);
  });

  it('admits an actor who cancels in execution when the work order has an outstanding withdrawal', async () => {
    const actors = new FakeWorkOrderActors().withCapabilities(ACTOR_ID, {
      cancelsInExecution: true,
    });
    const authorizer = new CancellationAuthorizer(actors);

    await expect(
      authorizer.assertMayCancel(workOrder(WorkOrderStatus.InExecution, 2), ACTOR_ID),
    ).resolves.toBeUndefined();
  });

  it('refuses the same way in AWAITING_APPROVAL after a supplementary round, not only IN_EXECUTION (H36 against H38)', async () => {
    const authorizer = new CancellationAuthorizer(new FakeWorkOrderActors());

    await expect(
      authorizer.assertMayCancel(workOrder(WorkOrderStatus.AwaitingApproval, 2), ACTOR_ID),
    ).rejects.toThrow(CancelInExecutionForbiddenError);
  });

  it('admits the elevated actor in AWAITING_APPROVAL too, so the refusal is about outstanding parts, not the state', async () => {
    const actors = new FakeWorkOrderActors().withCapabilities(ACTOR_ID, {
      cancelsInExecution: true,
    });
    const authorizer = new CancellationAuthorizer(actors);

    await expect(
      authorizer.assertMayCancel(workOrder(WorkOrderStatus.AwaitingApproval, 2), ACTOR_ID),
    ).resolves.toBeUndefined();
  });
});
