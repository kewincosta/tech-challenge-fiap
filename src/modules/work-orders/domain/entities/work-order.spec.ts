import { describe, expect, it } from 'vitest';
import { Money } from '../../../../shared/domain/value-objects/money';
import { BudgetStatus } from '../budget-status';
import { BudgetedItemNotRemovableError } from '../errors/budgeted-item-not-removable.error';
import { DiagnosisWithoutItemsError } from '../errors/diagnosis-without-items.error';
import { DiscountExceedsChargedTotalError } from '../errors/discount-exceeds-charged-total.error';
import { DuplicateBatchLineError } from '../errors/duplicate-batch-line.error';
import { EmptyDraftBudgetError } from '../errors/empty-draft-budget.error';
import { PartNotWithdrawableError } from '../errors/part-not-withdrawable.error';
import { ReturnExceedsWithdrawnError } from '../errors/return-exceeds-withdrawn.error';
import { WithdrawalExceedsPlannedError } from '../errors/withdrawal-exceeds-planned.error';
import { WorkOrderItemNotFoundError } from '../errors/work-order-item-not-found.error';
import { WorkOrderStateError } from '../errors/work-order-state.error';
import { BudgetApproved } from '../events/budget-approved.event';
import { BudgetGenerated } from '../events/budget-generated.event';
import { BudgetRejected } from '../events/budget-rejected.event';
import { BudgetSent } from '../events/budget-sent.event';
import { DiagnosisCompleted } from '../events/diagnosis-completed.event';
import { DiagnosisStarted } from '../events/diagnosis-started.event';
import { DiscountApplied } from '../events/discount-applied.event';
import { ExecutionStarted } from '../events/execution-started.event';
import { ItemRemovedFromWorkOrder } from '../events/item-removed-from-work-order.event';
import { MechanicAssigned } from '../events/mechanic-assigned.event';
import { PartPlannedForWorkOrder } from '../events/part-planned-for-work-order.event';
import { PartReturned } from '../events/part-returned.event';
import { PartWithdrawn } from '../events/part-withdrawn.event';
import { ServiceAddedToWorkOrder } from '../events/service-added-to-work-order.event';
import { SupplementaryBudgetGenerated } from '../events/supplementary-budget-generated.event';
import { VehicleDelivered } from '../events/vehicle-delivered.event';
import { WorkOrderCompleted } from '../events/work-order-completed.event';
import { WorkOrderCreated } from '../events/work-order-created.event';
import { BudgetId } from '../value-objects/budget-id';
import { PlannedQuantity } from '../value-objects/planned-quantity';
import { WorkOrderId } from '../value-objects/work-order-id';
import { WorkOrderItemId } from '../value-objects/work-order-item-id';
import { WorkOrderNumber } from '../value-objects/work-order-number';
import { WorkOrderStatus } from '../work-order-status';
import { Budget } from './budget';
import { WorkOrder } from './work-order';
import { WorkOrderPartItem } from './work-order-part-item';
import { WorkOrderServiceItem } from './work-order-service-item';

const WORK_ORDER_ID = WorkOrderId.create('11111111-1111-4111-8111-111111111111');
const CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';
const VEHICLE_ID = '33333333-3333-4333-8333-333333333333';
const CREATOR_ID = '44444444-4444-4444-8444-444444444444';
const MECHANIC_ID = '55555555-5555-4555-8555-555555555555';
const NOW = new Date('2026-08-31T12:00:00.000Z');

function openWorkOrder(): WorkOrder {
  return WorkOrder.open({
    id: WORK_ORDER_ID,
    number: WorkOrderNumber.create('A1B090-2026'),
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

function restoreWorkOrder(status: WorkOrderStatus, assignedMechanicUserId: string | null = null): WorkOrder {
  return WorkOrder.restore({
    id: WORK_ORDER_ID,
    number: WorkOrderNumber.create('A1B090-2026'),
    customerId: CUSTOMER_ID,
    vehicleId: VEHICLE_ID,
    assignedMechanicUserId,
    createdByUserId: CREATOR_ID,
    status,
    customerName: 'Jane Doe',
    vehiclePlate: 'ABC1234',
    vehicleBrand: 'Toyota',
    vehicleModel: 'Corolla',
    vehicleYear: 2020,
    createdAt: NOW,
    updatedAt: NOW,
    serviceItems: [
      WorkOrderServiceItem.restore({
        id: WorkOrderItemId.create('66666666-6666-4666-8666-666666666666'),
        serviceId: '77777777-7777-4777-8777-777777777777',
        serviceName: 'Troca de oleo',
        unitPrice: Money.fromCents(15099),
        budgetRound: null,
        budgetedUnitPrice: null,
      }),
    ],
    partItems: [],
    diagnosisStartedAt: null,
    diagnosisCompletedAt: null,
    budgets: [],
    budgetDecidedAt: null,
    budgetDecidedByUserId: null,
    executionStartedAt: null,
  });
}

describe('WorkOrder', () => {
  it('should start RECEIVED, store the customer and vehicle snapshot, record the creator and record WorkOrderCreated', () => {
    const workOrder = openWorkOrder();

    expect(workOrder.status).toBe(WorkOrderStatus.Received);
    expect(workOrder.customerName).toBe('Jane Doe');
    expect(workOrder.vehiclePlate).toBe('ABC1234');
    expect(workOrder.vehicleBrand).toBe('Toyota');
    expect(workOrder.vehicleModel).toBe('Corolla');
    expect(workOrder.vehicleYear).toBe(2020);
    expect(workOrder.createdByUserId).toBe(CREATOR_ID);
    const events = workOrder.pullDomainEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toBeInstanceOf(WorkOrderCreated);
  });

  it('should rebuild from persisted props with its items and no trail via restore', () => {
    const workOrder = restoreWorkOrder(WorkOrderStatus.Received);

    expect(workOrder.serviceItems).toHaveLength(1);
    expect(workOrder.pullDomainEvents()).toHaveLength(0);
  });

  it('should append an item and record ServiceAddedToWorkOrder when adding a service in RECEIVED', () => {
    const workOrder = openWorkOrder();
    workOrder.pullDomainEvents();

    workOrder.addService({
      itemId: WorkOrderItemId.create('88888888-8888-4888-8888-888888888888'),
      serviceId: '77777777-7777-4777-8777-777777777777',
      serviceName: 'Troca de oleo',
      unitPrice: Money.fromCents(15099),
      actorUserId: CREATOR_ID,
      now: NOW,
    });

    expect(workOrder.serviceItems).toHaveLength(1);
    const events = workOrder.pullDomainEvents();
    expect(events[0]).toBeInstanceOf(ServiceAddedToWorkOrder);
  });

  it('should record two separate items when the same service is added twice', () => {
    const workOrder = openWorkOrder();

    workOrder.addService({
      itemId: WorkOrderItemId.create('88888888-8888-4888-8888-888888888888'),
      serviceId: '77777777-7777-4777-8777-777777777777',
      serviceName: 'Troca de oleo',
      unitPrice: Money.fromCents(15099),
      actorUserId: CREATOR_ID,
      now: NOW,
    });
    workOrder.addService({
      itemId: WorkOrderItemId.create('99999999-9999-4999-8999-999999999999'),
      serviceId: '77777777-7777-4777-8777-777777777777',
      serviceName: 'Troca de oleo',
      unitPrice: Money.fromCents(15099),
      actorUserId: CREATOR_ID,
      now: NOW,
    });

    expect(workOrder.serviceItems).toHaveLength(2);
  });

  it('should throw WorkOrderStateError naming the current status when addService is called in a forbidden state', () => {
    const workOrder = restoreWorkOrder(WorkOrderStatus.Delivered);

    expect(() =>
      workOrder.addService({
        itemId: WorkOrderItemId.create('88888888-8888-4888-8888-888888888888'),
        serviceId: '77777777-7777-4777-8777-777777777777',
        serviceName: 'Troca de oleo',
        unitPrice: Money.fromCents(15099),
        actorUserId: CREATOR_ID,
        now: NOW,
      }),
    ).toThrow(WorkOrderStateError);
    try {
      workOrder.addService({
        itemId: WorkOrderItemId.create('88888888-8888-4888-8888-888888888888'),
        serviceId: '77777777-7777-4777-8777-777777777777',
        serviceName: 'Troca de oleo',
        unitPrice: Money.fromCents(15099),
        actorUserId: CREATOR_ID,
        now: NOW,
      });
    } catch (error) {
      expect((error as WorkOrderStateError).currentStatus).toBe(WorkOrderStatus.Delivered);
    }
  });

  it('should append an item and record PartPlannedForWorkOrder when planning a part in IN_DIAGNOSIS', () => {
    const workOrder = restoreWorkOrder(WorkOrderStatus.InDiagnosis);
    workOrder.pullDomainEvents();

    workOrder.planPart({
      itemId: WorkOrderItemId.create('88888888-8888-4888-8888-888888888888'),
      inventoryItemId: '99999999-9999-4999-8999-999999999999',
      sku: 'FLT-001',
      itemName: 'Filtro de oleo',
      unitPrice: Money.fromCents(2500),
      plannedQuantity: PlannedQuantity.create(2),
      actorUserId: CREATOR_ID,
      now: NOW,
    });

    expect(workOrder.partItems).toHaveLength(1);
    const events = workOrder.pullDomainEvents();
    expect(events[0]).toBeInstanceOf(PartPlannedForWorkOrder);
  });

  it('should throw WorkOrderStateError when a part is planned in RECEIVED (L-003, first layer)', () => {
    const workOrder = openWorkOrder();

    expect(() =>
      workOrder.planPart({
        itemId: WorkOrderItemId.create('88888888-8888-4888-8888-888888888888'),
        inventoryItemId: '99999999-9999-4999-8999-999999999999',
        sku: 'FLT-001',
        itemName: 'Filtro de oleo',
        unitPrice: Money.fromCents(2500),
        plannedQuantity: PlannedQuantity.create(2),
        actorUserId: CREATOR_ID,
        now: NOW,
      }),
    ).toThrow(WorkOrderStateError);
  });

  it('should remove a service item and leave every other item in place', () => {
    const workOrder = openWorkOrder();
    workOrder.addService({
      itemId: WorkOrderItemId.create('88888888-8888-4888-8888-888888888888'),
      serviceId: '77777777-7777-4777-8777-777777777777',
      serviceName: 'Troca de oleo',
      unitPrice: Money.fromCents(15099),
      actorUserId: CREATOR_ID,
      now: NOW,
    });
    const keptId = WorkOrderItemId.create('99999999-9999-4999-8999-999999999999');
    workOrder.addService({
      itemId: keptId,
      serviceId: '77777777-7777-4777-8777-777777777777',
      serviceName: 'Alinhamento',
      unitPrice: Money.fromCents(8000),
      actorUserId: CREATOR_ID,
      now: NOW,
    });

    workOrder.removeItem({
      itemId: WorkOrderItemId.create('88888888-8888-4888-8888-888888888888'),
      actorUserId: CREATOR_ID,
      now: NOW,
    });

    expect(workOrder.serviceItems).toHaveLength(1);
    expect(workOrder.serviceItems[0].id.equals(keptId)).toBe(true);
  });

  it('should remove a part item', () => {
    const workOrder = restoreWorkOrder(WorkOrderStatus.InDiagnosis);
    const partId = WorkOrderItemId.create('88888888-8888-4888-8888-888888888888');
    workOrder.planPart({
      itemId: partId,
      inventoryItemId: '99999999-9999-4999-8999-999999999999',
      sku: 'FLT-001',
      itemName: 'Filtro de oleo',
      unitPrice: Money.fromCents(2500),
      plannedQuantity: PlannedQuantity.create(2),
      actorUserId: CREATOR_ID,
      now: NOW,
    });

    workOrder.removeItem({ itemId: partId, actorUserId: CREATOR_ID, now: NOW });

    expect(workOrder.partItems).toHaveLength(0);
    const events = workOrder.pullDomainEvents();
    expect(events.some((event) => event instanceof ItemRemovedFromWorkOrder)).toBe(true);
  });

  it('should throw WorkOrderItemNotFoundError when the addressed item does not belong to the work order', () => {
    const workOrder = openWorkOrder();

    expect(() =>
      workOrder.removeItem({
        itemId: WorkOrderItemId.create('99999999-9999-4999-8999-999999999999'),
        actorUserId: CREATOR_ID,
        now: NOW,
      }),
    ).toThrow(WorkOrderItemNotFoundError);
  });

  it('should record the assignee and MechanicAssigned when assigning a mechanic', () => {
    const workOrder = openWorkOrder();
    workOrder.pullDomainEvents();

    workOrder.assignMechanic({ mechanicUserId: MECHANIC_ID, actorUserId: CREATOR_ID, now: NOW });

    expect(workOrder.assignedMechanicUserId).toBe(MECHANIC_ID);
    const events = workOrder.pullDomainEvents();
    expect(events[0]).toBeInstanceOf(MechanicAssigned);
  });

  it('should replace an existing assignee', () => {
    const workOrder = openWorkOrder();
    workOrder.assignMechanic({ mechanicUserId: MECHANIC_ID, actorUserId: CREATOR_ID, now: NOW });
    const secondMechanicId = '66666666-6666-4666-8666-666666666666';

    workOrder.assignMechanic({
      mechanicUserId: secondMechanicId,
      actorUserId: CREATOR_ID,
      now: NOW,
    });

    expect(workOrder.assignedMechanicUserId).toBe(secondMechanicId);
  });

  it('should throw WorkOrderStateError when assigning a mechanic on a DELIVERED or CANCELED work order', () => {
    const delivered = restoreWorkOrder(WorkOrderStatus.Delivered);
    const canceled = restoreWorkOrder(WorkOrderStatus.Canceled);

    expect(() =>
      delivered.assignMechanic({ mechanicUserId: MECHANIC_ID, actorUserId: CREATOR_ID, now: NOW }),
    ).toThrow(WorkOrderStateError);
    expect(() =>
      canceled.assignMechanic({ mechanicUserId: MECHANIC_ID, actorUserId: CREATOR_ID, now: NOW }),
    ).toThrow(WorkOrderStateError);
  });

  it('should move a RECEIVED work order to IN_DIAGNOSIS and record diagnosisStartedAt', () => {
    const workOrder = openWorkOrder();
    workOrder.pullDomainEvents();

    workOrder.startDiagnosis({ actorUserId: MECHANIC_ID, now: NOW });

    expect(workOrder.status).toBe(WorkOrderStatus.InDiagnosis);
    expect(workOrder.diagnosisStartedAt).toEqual(NOW);
  });

  it('should assign the acting user as mechanic when there is none', () => {
    const workOrder = openWorkOrder();

    workOrder.startDiagnosis({ actorUserId: MECHANIC_ID, now: NOW });

    expect(workOrder.assignedMechanicUserId).toBe(MECHANIC_ID);
  });

  it('should leave an existing mechanic assignment untouched', () => {
    const workOrder = restoreWorkOrder(WorkOrderStatus.Received, MECHANIC_ID);
    const otherActorId = '66666666-6666-4666-8666-666666666666';

    workOrder.startDiagnosis({ actorUserId: otherActorId, now: NOW });

    expect(workOrder.assignedMechanicUserId).toBe(MECHANIC_ID);
  });

  it('should refuse to start the diagnosis on any state other than RECEIVED', () => {
    const inDiagnosis = restoreWorkOrder(WorkOrderStatus.InDiagnosis);

    expect(() => inDiagnosis.startDiagnosis({ actorUserId: MECHANIC_ID, now: NOW })).toThrow(
      WorkOrderStateError,
    );
  });

  it('should refuse a second startDiagnosis, the diagnosis already started', () => {
    const workOrder = openWorkOrder();
    workOrder.startDiagnosis({ actorUserId: MECHANIC_ID, now: NOW });

    expect(() => workOrder.startDiagnosis({ actorUserId: MECHANIC_ID, now: NOW })).toThrow(
      WorkOrderStateError,
    );
  });

  it('should record exactly one DiagnosisStarted and no MechanicAssigned', () => {
    const workOrder = openWorkOrder();
    workOrder.pullDomainEvents();

    workOrder.startDiagnosis({ actorUserId: MECHANIC_ID, now: NOW });

    const events = workOrder.pullDomainEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toBeInstanceOf(DiagnosisStarted);
  });

  it('should rebuild diagnosisStartedAt via restore', () => {
    const workOrder = WorkOrder.restore({
      id: WORK_ORDER_ID,
      number: WorkOrderNumber.create('A1B090-2026'),
      customerId: CUSTOMER_ID,
      vehicleId: VEHICLE_ID,
      assignedMechanicUserId: MECHANIC_ID,
      createdByUserId: CREATOR_ID,
      status: WorkOrderStatus.InDiagnosis,
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
      diagnosisCompletedAt: null,
      budgets: [],
      budgetDecidedAt: null,
      budgetDecidedByUserId: null,
      executionStartedAt: null,
    });

    expect(workOrder.diagnosisStartedAt).toEqual(NOW);
  });
});

describe('WorkOrder.completeDiagnosis', () => {
  const BUDGET_ID = BudgetId.create('88888888-8888-4888-8888-888888888888');
  const PART_ID = WorkOrderItemId.create('99999999-9999-4999-8999-999999999999');
  const INVENTORY_ITEM_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  function inDiagnosisWithServiceAndPart(): WorkOrder {
    const workOrder = restoreWorkOrder(WorkOrderStatus.InDiagnosis, MECHANIC_ID);
    workOrder.planPart({
      itemId: PART_ID,
      inventoryItemId: INVENTORY_ITEM_ID,
      sku: 'FLT-001',
      itemName: 'Filtro de oleo',
      unitPrice: Money.fromCents(2500),
      plannedQuantity: PlannedQuantity.create(2),
      actorUserId: MECHANIC_ID,
      now: NOW,
    });
    return workOrder;
  }

  function emptyInDiagnosis(): WorkOrder {
    return WorkOrder.restore({
      id: WORK_ORDER_ID,
      number: WorkOrderNumber.create('A1B090-2026'),
      customerId: CUSTOMER_ID,
      vehicleId: VEHICLE_ID,
      assignedMechanicUserId: MECHANIC_ID,
      createdByUserId: CREATOR_ID,
      status: WorkOrderStatus.InDiagnosis,
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
      diagnosisCompletedAt: null,
      budgets: [],
      budgetDecidedAt: null,
      budgetDecidedByUserId: null,
      executionStartedAt: null,
    });
  }

  it('moves IN_DIAGNOSIS to AWAITING_APPROVAL and records diagnosisCompletedAt', () => {
    const workOrder = inDiagnosisWithServiceAndPart();

    workOrder.completeDiagnosis({ budgetId: BUDGET_ID, actorUserId: MECHANIC_ID, now: NOW });

    expect(workOrder.status).toBe(WorkOrderStatus.AwaitingApproval);
    expect(workOrder.diagnosisCompletedAt).toEqual(NOW);
  });

  it('refuses a work order carrying no service item and no part item', () => {
    const workOrder = emptyInDiagnosis();

    expect(() =>
      workOrder.completeDiagnosis({ budgetId: BUDGET_ID, actorUserId: MECHANIC_ID, now: NOW }),
    ).toThrow(DiagnosisWithoutItemsError);
  });

  it('refuses to complete the diagnosis on any state other than IN_DIAGNOSIS', () => {
    const workOrder = openWorkOrder();

    expect(() =>
      workOrder.completeDiagnosis({ budgetId: BUDGET_ID, actorUserId: MECHANIC_ID, now: NOW }),
    ).toThrow(WorkOrderStateError);
  });

  it('computes the round total as the service price plus each part price times its planned quantity', () => {
    const workOrder = inDiagnosisWithServiceAndPart();

    workOrder.completeDiagnosis({ budgetId: BUDGET_ID, actorUserId: MECHANIC_ID, now: NOW });

    // 150.99 (service) + 2 x 25.00 (part) = 200.99
    expect(workOrder.budgets[0].total.cents).toBe(20099);
    expect(workOrder.budgets[0].round).toBe(1);
    expect(workOrder.budgets[0].status).toBe(BudgetStatus.Pending);
  });

  it('attaches every draft item to round one, copying unitPrice as the budgeted price and leaving unitPrice itself untouched', () => {
    const workOrder = inDiagnosisWithServiceAndPart();

    workOrder.completeDiagnosis({ budgetId: BUDGET_ID, actorUserId: MECHANIC_ID, now: NOW });

    expect(workOrder.serviceItems[0].budgetRound).toBe(1);
    expect(workOrder.serviceItems[0].budgetedUnitPrice?.cents).toBe(15099);
    expect(workOrder.serviceItems[0].unitPrice.cents).toBe(15099);
    expect(workOrder.partItems[0].budgetRound).toBe(1);
    expect(workOrder.partItems[0].budgetedUnitPrice?.cents).toBe(2500);
    expect(workOrder.partItems[0].unitPrice.cents).toBe(2500);
  });

  it('regenerates an existing rejected round one in place rather than opening round two', () => {
    const rejectedBudget = Budget.restore({
      id: BudgetId.create('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
      round: 1,
      total: Money.fromCents(9999),
      status: BudgetStatus.Rejected,
      generatedAt: new Date('2026-08-30T09:00:00Z'),
      decidedAt: new Date('2026-08-30T10:00:00Z'),
      decidedByUserId: CUSTOMER_ID,
    });
    const attachedServiceItem = WorkOrderServiceItem.restore({
      id: WorkOrderItemId.create('66666666-6666-4666-8666-666666666666'),
      serviceId: '77777777-7777-4777-8777-777777777777',
      serviceName: 'Troca de oleo',
      unitPrice: Money.fromCents(15099),
      budgetRound: 1,
      budgetedUnitPrice: Money.fromCents(15099),
    });
    const workOrder = WorkOrder.restore({
      id: WORK_ORDER_ID,
      number: WorkOrderNumber.create('A1B090-2026'),
      customerId: CUSTOMER_ID,
      vehicleId: VEHICLE_ID,
      assignedMechanicUserId: MECHANIC_ID,
      createdByUserId: CREATOR_ID,
      status: WorkOrderStatus.InDiagnosis,
      customerName: 'Jane Doe',
      vehiclePlate: 'ABC1234',
      vehicleBrand: 'Toyota',
      vehicleModel: 'Corolla',
      vehicleYear: 2020,
      createdAt: NOW,
      updatedAt: NOW,
      serviceItems: [attachedServiceItem],
      partItems: [],
      diagnosisStartedAt: NOW,
      diagnosisCompletedAt: NOW,
      budgets: [rejectedBudget],
      budgetDecidedAt: null,
      budgetDecidedByUserId: null,
      executionStartedAt: null,
    });

    workOrder.completeDiagnosis({ budgetId: BUDGET_ID, actorUserId: MECHANIC_ID, now: NOW });

    expect(workOrder.budgets).toHaveLength(1);
    expect(workOrder.budgets[0].status).toBe(BudgetStatus.Pending);
    expect(workOrder.budgets[0].total.cents).toBe(15099);
    expect(workOrder.budgets[0].decidedAt).toBeNull();
  });

  it('records DiagnosisCompleted, BudgetGenerated and BudgetSent in that order', () => {
    const workOrder = inDiagnosisWithServiceAndPart();
    workOrder.pullDomainEvents();

    workOrder.completeDiagnosis({ budgetId: BUDGET_ID, actorUserId: MECHANIC_ID, now: NOW });

    const events = workOrder.pullDomainEvents();
    expect(events).toHaveLength(3);
    expect(events[0]).toBeInstanceOf(DiagnosisCompleted);
    expect(events[1]).toBeInstanceOf(BudgetGenerated);
    expect(events[2]).toBeInstanceOf(BudgetSent);
  });
});

describe('WorkOrder.approveBudget and rejectBudget', () => {
  function awaitingApprovalWithPendingRound(
    round: number,
    executionStartedAt: Date | null = null,
  ): WorkOrder {
    const pendingBudget = Budget.generate({
      id: BudgetId.create('cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
      round,
      total: Money.fromCents(15099),
      generatedAt: NOW,
    });
    const attachedServiceItem = WorkOrderServiceItem.restore({
      id: WorkOrderItemId.create('66666666-6666-4666-8666-666666666666'),
      serviceId: '77777777-7777-4777-8777-777777777777',
      serviceName: 'Troca de oleo',
      unitPrice: Money.fromCents(15099),
      budgetRound: round,
      budgetedUnitPrice: Money.fromCents(15099),
    });
    return WorkOrder.restore({
      id: WORK_ORDER_ID,
      number: WorkOrderNumber.create('A1B090-2026'),
      customerId: CUSTOMER_ID,
      vehicleId: VEHICLE_ID,
      assignedMechanicUserId: MECHANIC_ID,
      createdByUserId: CREATOR_ID,
      status: WorkOrderStatus.AwaitingApproval,
      customerName: 'Jane Doe',
      vehiclePlate: 'ABC1234',
      vehicleBrand: 'Toyota',
      vehicleModel: 'Corolla',
      vehicleYear: 2020,
      createdAt: NOW,
      updatedAt: NOW,
      serviceItems: [attachedServiceItem],
      partItems: [],
      diagnosisStartedAt: NOW,
      diagnosisCompletedAt: NOW,
      budgets: [pendingBudget],
      budgetDecidedAt: null,
      budgetDecidedByUserId: null,
      executionStartedAt,
    });
  }

  it('approves the pending round, moves to IN_EXECUTION and sets executionStartedAt the first time', () => {
    const workOrder = awaitingApprovalWithPendingRound(1);

    workOrder.approveBudget({ actorUserId: CUSTOMER_ID, now: NOW });

    expect(workOrder.status).toBe(WorkOrderStatus.InExecution);
    expect(workOrder.budgets[0].status).toBe(BudgetStatus.Approved);
    expect(workOrder.budgets[0].decidedByUserId).toBe(CUSTOMER_ID);
    expect(workOrder.budgetDecidedAt).toEqual(NOW);
    expect(workOrder.budgetDecidedByUserId).toBe(CUSTOMER_ID);
    expect(workOrder.executionStartedAt).toEqual(NOW);
  });

  it('leaves executionStartedAt at its first value on a second entry into execution', () => {
    const firstEntry = new Date('2026-08-30T09:00:00Z');
    const workOrder = awaitingApprovalWithPendingRound(2, firstEntry);

    workOrder.approveBudget({ actorUserId: CUSTOMER_ID, now: NOW });

    expect(workOrder.executionStartedAt).toEqual(firstEntry);
  });

  it('rejects round one and returns the work order to IN_DIAGNOSIS', () => {
    const workOrder = awaitingApprovalWithPendingRound(1);

    workOrder.rejectBudget({ actorUserId: CUSTOMER_ID, now: NOW });

    expect(workOrder.status).toBe(WorkOrderStatus.InDiagnosis);
    expect(workOrder.budgets[0].status).toBe(BudgetStatus.Rejected);
  });

  it('rejects a round above one and returns to IN_EXECUTION, recording ExecutionStarted alongside BudgetRejected', () => {
    const firstEntry = new Date('2026-08-30T09:00:00Z');
    const workOrder = awaitingApprovalWithPendingRound(2, firstEntry);
    workOrder.pullDomainEvents();

    workOrder.rejectBudget({ actorUserId: CUSTOMER_ID, now: NOW });

    expect(workOrder.status).toBe(WorkOrderStatus.InExecution);
    expect(workOrder.executionStartedAt).toEqual(firstEntry);
    const events = workOrder.pullDomainEvents();
    expect(events).toHaveLength(2);
    expect(events[0]).toBeInstanceOf(BudgetRejected);
    expect(events[1]).toBeInstanceOf(ExecutionStarted);
  });

  it("keeps a rejected round's items attached with their budgeted price intact", () => {
    const workOrder = awaitingApprovalWithPendingRound(1);

    workOrder.rejectBudget({ actorUserId: CUSTOMER_ID, now: NOW });

    expect(workOrder.serviceItems[0].budgetRound).toBe(1);
    expect(workOrder.serviceItems[0].budgetedUnitPrice?.cents).toBe(15099);
  });

  it('refuses to decide outside AWAITING_APPROVAL', () => {
    const workOrder = restoreWorkOrder(WorkOrderStatus.InDiagnosis);

    expect(() => workOrder.approveBudget({ actorUserId: CUSTOMER_ID, now: NOW })).toThrow(
      WorkOrderStateError,
    );
    expect(() => workOrder.rejectBudget({ actorUserId: CUSTOMER_ID, now: NOW })).toThrow(
      WorkOrderStateError,
    );
  });

  it('records BudgetApproved then ExecutionStarted on approval', () => {
    const workOrder = awaitingApprovalWithPendingRound(1);
    workOrder.pullDomainEvents();

    workOrder.approveBudget({ actorUserId: CUSTOMER_ID, now: NOW });

    const events = workOrder.pullDomainEvents();
    expect(events).toHaveLength(2);
    expect(events[0]).toBeInstanceOf(BudgetApproved);
    expect(events[1]).toBeInstanceOf(ExecutionStarted);
  });

  it('mirrors the latest decision on budgetDecidedAt and budgetDecidedByUserId', () => {
    const workOrder = awaitingApprovalWithPendingRound(1);

    workOrder.rejectBudget({ actorUserId: CUSTOMER_ID, now: NOW });

    expect(workOrder.budgetDecidedAt).toEqual(NOW);
    expect(workOrder.budgetDecidedByUserId).toBe(CUSTOMER_ID);
  });
});

describe('WorkOrder.submitSupplementaryBudget', () => {
  const SUPPLEMENTARY_BUDGET_ID = BudgetId.create('dddddddd-dddd-4ddd-8ddd-dddddddddddd');
  const EXECUTION_START = new Date('2026-08-30T09:00:00Z');
  const NEW_ITEM_ID = WorkOrderItemId.create('88888888-8888-4888-8888-888888888888');

  function inExecutionWithApprovedRoundOne(): WorkOrder {
    const approvedBudget = Budget.restore({
      id: BudgetId.create('cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
      round: 1,
      total: Money.fromCents(15099),
      status: BudgetStatus.Approved,
      generatedAt: EXECUTION_START,
      decidedAt: EXECUTION_START,
      decidedByUserId: CUSTOMER_ID,
    });
    const attachedServiceItem = WorkOrderServiceItem.restore({
      id: WorkOrderItemId.create('66666666-6666-4666-8666-666666666666'),
      serviceId: '77777777-7777-4777-8777-777777777777',
      serviceName: 'Troca de oleo',
      unitPrice: Money.fromCents(15099),
      budgetRound: 1,
      budgetedUnitPrice: Money.fromCents(15099),
    });
    return WorkOrder.restore({
      id: WORK_ORDER_ID,
      number: WorkOrderNumber.create('A1B090-2026'),
      customerId: CUSTOMER_ID,
      vehicleId: VEHICLE_ID,
      assignedMechanicUserId: MECHANIC_ID,
      createdByUserId: CREATOR_ID,
      status: WorkOrderStatus.InExecution,
      customerName: 'Jane Doe',
      vehiclePlate: 'ABC1234',
      vehicleBrand: 'Toyota',
      vehicleModel: 'Corolla',
      vehicleYear: 2020,
      createdAt: NOW,
      updatedAt: NOW,
      serviceItems: [attachedServiceItem],
      partItems: [],
      diagnosisStartedAt: EXECUTION_START,
      diagnosisCompletedAt: EXECUTION_START,
      budgets: [approvedBudget],
      budgetDecidedAt: EXECUTION_START,
      budgetDecidedByUserId: CUSTOMER_ID,
      executionStartedAt: EXECUTION_START,
    });
  }

  function addDraftService(workOrder: WorkOrder): void {
    workOrder.addService({
      itemId: NEW_ITEM_ID,
      serviceId: '77777777-7777-4777-8777-777777777777',
      serviceName: 'Alinhamento',
      unitPrice: Money.fromCents(8000),
      actorUserId: MECHANIC_ID,
      now: NOW,
    });
  }

  it('guards IN_EXECUTION, generates round two over the draft items and moves to AWAITING_APPROVAL', () => {
    const workOrder = inExecutionWithApprovedRoundOne();
    addDraftService(workOrder);

    workOrder.submitSupplementaryBudget({
      budgetId: SUPPLEMENTARY_BUDGET_ID,
      actorUserId: MECHANIC_ID,
      now: NOW,
    });

    expect(workOrder.status).toBe(WorkOrderStatus.AwaitingApproval);
    expect(workOrder.budgets).toHaveLength(2);
    expect(workOrder.budgets[1].round).toBe(2);
    expect(workOrder.budgets[1].total.cents).toBe(8000);
  });

  it('refuses an empty draft with EmptyDraftBudgetError', () => {
    const workOrder = inExecutionWithApprovedRoundOne();

    expect(() =>
      workOrder.submitSupplementaryBudget({
        budgetId: SUPPLEMENTARY_BUDGET_ID,
        actorUserId: MECHANIC_ID,
        now: NOW,
      }),
    ).toThrow(EmptyDraftBudgetError);
  });

  it('refuses to submit outside IN_EXECUTION', () => {
    const workOrder = restoreWorkOrder(WorkOrderStatus.InDiagnosis);

    expect(() =>
      workOrder.submitSupplementaryBudget({
        budgetId: SUPPLEMENTARY_BUDGET_ID,
        actorUserId: MECHANIC_ID,
        now: NOW,
      }),
    ).toThrow(WorkOrderStateError);
  });

  it('never re-prices or re-attaches an item already attached to a decided round', () => {
    const workOrder = inExecutionWithApprovedRoundOne();
    addDraftService(workOrder);

    workOrder.submitSupplementaryBudget({
      budgetId: SUPPLEMENTARY_BUDGET_ID,
      actorUserId: MECHANIC_ID,
      now: NOW,
    });

    const roundOneItem = workOrder.serviceItems.find(
      (item) => item.serviceName === 'Troca de oleo',
    );
    expect(roundOneItem?.budgetRound).toBe(1);
    expect(roundOneItem?.budgetedUnitPrice?.cents).toBe(15099);
  });

  it('records SupplementaryBudgetGenerated then BudgetSent', () => {
    const workOrder = inExecutionWithApprovedRoundOne();
    addDraftService(workOrder);
    workOrder.pullDomainEvents();

    workOrder.submitSupplementaryBudget({
      budgetId: SUPPLEMENTARY_BUDGET_ID,
      actorUserId: MECHANIC_ID,
      now: NOW,
    });

    const events = workOrder.pullDomainEvents();
    expect(events).toHaveLength(2);
    expect(events[0]).toBeInstanceOf(SupplementaryBudgetGenerated);
    expect(events[1]).toBeInstanceOf(BudgetSent);
  });

  it('a full cycle from execution through approval back to execution ends with two rounds and one unchanged executionStartedAt', () => {
    const workOrder = inExecutionWithApprovedRoundOne();
    addDraftService(workOrder);
    workOrder.submitSupplementaryBudget({
      budgetId: SUPPLEMENTARY_BUDGET_ID,
      actorUserId: MECHANIC_ID,
      now: NOW,
    });

    workOrder.approveBudget({ actorUserId: CUSTOMER_ID, now: NOW });

    expect(workOrder.status).toBe(WorkOrderStatus.InExecution);
    expect(workOrder.budgets).toHaveLength(2);
    expect(workOrder.budgets.every((budget) => budget.status === BudgetStatus.Approved)).toBe(
      true,
    );
    expect(workOrder.executionStartedAt).toEqual(EXECUTION_START);
  });
});

describe('WorkOrder.removeItem budgeted-item guard', () => {
  it('refuses to remove an item already attached to a budget round', () => {
    const attachedServiceItem = WorkOrderServiceItem.restore({
      id: WorkOrderItemId.create('66666666-6666-4666-8666-666666666666'),
      serviceId: '77777777-7777-4777-8777-777777777777',
      serviceName: 'Troca de oleo',
      unitPrice: Money.fromCents(15099),
      budgetRound: 1,
      budgetedUnitPrice: Money.fromCents(15099),
    });
    const workOrder = WorkOrder.restore({
      id: WORK_ORDER_ID,
      number: WorkOrderNumber.create('A1B090-2026'),
      customerId: CUSTOMER_ID,
      vehicleId: VEHICLE_ID,
      assignedMechanicUserId: MECHANIC_ID,
      createdByUserId: CREATOR_ID,
      status: WorkOrderStatus.InDiagnosis,
      customerName: 'Jane Doe',
      vehiclePlate: 'ABC1234',
      vehicleBrand: 'Toyota',
      vehicleModel: 'Corolla',
      vehicleYear: 2020,
      createdAt: NOW,
      updatedAt: NOW,
      serviceItems: [attachedServiceItem],
      partItems: [],
      diagnosisStartedAt: NOW,
      diagnosisCompletedAt: null,
      budgets: [],
      budgetDecidedAt: null,
      budgetDecidedByUserId: null,
      executionStartedAt: null,
    });

    expect(() =>
      workOrder.removeItem({ itemId: attachedServiceItem.id, actorUserId: CREATOR_ID, now: NOW }),
    ).toThrow(BudgetedItemNotRemovableError);
  });

  it('still removes a draft item', () => {
    const workOrder = openWorkOrder();
    workOrder.addService({
      itemId: WorkOrderItemId.create('88888888-8888-4888-8888-888888888888'),
      serviceId: '77777777-7777-4777-8777-777777777777',
      serviceName: 'Troca de oleo',
      unitPrice: Money.fromCents(15099),
      actorUserId: CREATOR_ID,
      now: NOW,
    });

    workOrder.removeItem({
      itemId: WorkOrderItemId.create('88888888-8888-4888-8888-888888888888'),
      actorUserId: CREATOR_ID,
      now: NOW,
    });

    expect(workOrder.serviceItems).toHaveLength(0);
  });
});

describe('WorkOrder.withdrawParts', () => {
  const APPROVED_ITEM_ID = WorkOrderItemId.create('66666666-6666-4666-8666-666666666666');
  const PENDING_ITEM_ID = WorkOrderItemId.create('77777777-7777-4777-8777-777777777777');
  const APPROVED_INVENTORY_ITEM_ID = '88888888-8888-4888-8888-888888888888';
  const PENDING_INVENTORY_ITEM_ID = '99999999-9999-4999-8999-999999999999';

  function approvedRoundOnePart(withdrawnQuantity = 0): WorkOrderPartItem {
    return WorkOrderPartItem.restore({
      id: APPROVED_ITEM_ID,
      inventoryItemId: APPROVED_INVENTORY_ITEM_ID,
      sku: 'FLT-001',
      itemName: 'Filtro de oleo',
      unitPrice: Money.fromCents(2500),
      plannedQuantity: PlannedQuantity.create(3),
      withdrawnQuantity,
      budgetRound: 1,
      budgetedUnitPrice: Money.fromCents(2500),
    });
  }

  function pendingRoundTwoPart(): WorkOrderPartItem {
    return WorkOrderPartItem.restore({
      id: PENDING_ITEM_ID,
      inventoryItemId: PENDING_INVENTORY_ITEM_ID,
      sku: 'BLT-002',
      itemName: 'Correia',
      unitPrice: Money.fromCents(4000),
      plannedQuantity: PlannedQuantity.create(1),
      withdrawnQuantity: 0,
      budgetRound: 2,
      budgetedUnitPrice: Money.fromCents(4000),
    });
  }

  function restoreInExecution(
    partItems: WorkOrderPartItem[],
    budgets: Budget[],
    status: WorkOrderStatus = WorkOrderStatus.InExecution,
  ): WorkOrder {
    return WorkOrder.restore({
      id: WORK_ORDER_ID,
      number: WorkOrderNumber.create('A1B090-2026'),
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
      partItems,
      diagnosisStartedAt: NOW,
      diagnosisCompletedAt: NOW,
      budgets,
      budgetDecidedAt: NOW,
      budgetDecidedByUserId: CUSTOMER_ID,
      executionStartedAt: NOW,
    });
  }

  function approvedRoundOneBudget(): Budget {
    return Budget.restore({
      id: BudgetId.create('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
      round: 1,
      total: Money.fromCents(7500),
      status: BudgetStatus.Approved,
      generatedAt: NOW,
      decidedAt: NOW,
      decidedByUserId: CUSTOMER_ID,
    });
  }

  function pendingRoundTwoBudget(): Budget {
    return Budget.restore({
      id: BudgetId.create('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
      round: 2,
      total: Money.fromCents(4000),
      status: BudgetStatus.Pending,
      generatedAt: NOW,
      decidedAt: null,
      decidedByUserId: null,
    });
  }

  it('withdraws an approved-round item, returning the resolved inventory item id and quantity', () => {
    const workOrder = restoreInExecution([approvedRoundOnePart()], [approvedRoundOneBudget()]);

    const resolved = workOrder.withdrawParts({
      lines: [{ itemId: APPROVED_ITEM_ID, quantity: 2 }],
      actorUserId: MECHANIC_ID,
      now: NOW,
    });

    expect(resolved).toEqual([{ inventoryItemId: APPROVED_INVENTORY_ITEM_ID, quantity: 2 }]);
    expect(workOrder.partItems[0].withdrawnQuantity).toBe(2);
  });

  it('refuses to withdraw outside IN_EXECUTION', () => {
    const workOrder = restoreInExecution(
      [approvedRoundOnePart()],
      [approvedRoundOneBudget()],
      WorkOrderStatus.AwaitingApproval,
    );

    expect(() =>
      workOrder.withdrawParts({
        lines: [{ itemId: APPROVED_ITEM_ID, quantity: 1 }],
        actorUserId: MECHANIC_ID,
        now: NOW,
      }),
    ).toThrow(WorkOrderStateError);
  });

  it('refuses a batch naming the same item twice with DuplicateBatchLineError', () => {
    const workOrder = restoreInExecution([approvedRoundOnePart()], [approvedRoundOneBudget()]);

    expect(() =>
      workOrder.withdrawParts({
        lines: [
          { itemId: APPROVED_ITEM_ID, quantity: 1 },
          { itemId: APPROVED_ITEM_ID, quantity: 1 },
        ],
        actorUserId: MECHANIC_ID,
        now: NOW,
      }),
    ).toThrow(DuplicateBatchLineError);
  });

  it('refuses an item id that is not on this work order with WorkOrderItemNotFoundError', () => {
    const workOrder = restoreInExecution([approvedRoundOnePart()], [approvedRoundOneBudget()]);
    const unknownId = WorkOrderItemId.create('cccccccc-cccc-4ccc-8ccc-cccccccccccc');

    expect(() =>
      workOrder.withdrawParts({
        lines: [{ itemId: unknownId, quantity: 1 }],
        actorUserId: MECHANIC_ID,
        now: NOW,
      }),
    ).toThrow(WorkOrderItemNotFoundError);
  });

  it('refuses a draft item, attached to no round, with PartNotWithdrawableError', () => {
    const draft = WorkOrderPartItem.add({
      id: APPROVED_ITEM_ID,
      inventoryItemId: APPROVED_INVENTORY_ITEM_ID,
      sku: 'FLT-001',
      itemName: 'Filtro de oleo',
      unitPrice: Money.fromCents(2500),
      plannedQuantity: PlannedQuantity.create(3),
    });
    const workOrder = restoreInExecution([draft], []);

    expect(() =>
      workOrder.withdrawParts({
        lines: [{ itemId: APPROVED_ITEM_ID, quantity: 1 }],
        actorUserId: MECHANIC_ID,
        now: NOW,
      }),
    ).toThrow(PartNotWithdrawableError);
  });

  it('allows the line on an approved round and refuses the line on a round still awaiting approval, on the same call', () => {
    const workOrder = restoreInExecution(
      [approvedRoundOnePart(), pendingRoundTwoPart()],
      [approvedRoundOneBudget(), pendingRoundTwoBudget()],
    );

    expect(() =>
      workOrder.withdrawParts({
        lines: [{ itemId: PENDING_ITEM_ID, quantity: 1 }],
        actorUserId: MECHANIC_ID,
        now: NOW,
      }),
    ).toThrow(PartNotWithdrawableError);

    const resolved = workOrder.withdrawParts({
      lines: [{ itemId: APPROVED_ITEM_ID, quantity: 1 }],
      actorUserId: MECHANIC_ID,
      now: NOW,
    });
    expect(resolved).toEqual([{ inventoryItemId: APPROVED_INVENTORY_ITEM_ID, quantity: 1 }]);
  });

  it('refuses a withdrawal that would pass the planned quantity with WithdrawalExceedsPlannedError', () => {
    const workOrder = restoreInExecution([approvedRoundOnePart(3)], [approvedRoundOneBudget()]);

    expect(() =>
      workOrder.withdrawParts({
        lines: [{ itemId: APPROVED_ITEM_ID, quantity: 1 }],
        actorUserId: MECHANIC_ID,
        now: NOW,
      }),
    ).toThrow(WithdrawalExceedsPlannedError);
  });

  it('leaves every line untouched when a later line in the same batch fails validation', () => {
    const workOrder = restoreInExecution(
      [approvedRoundOnePart(), pendingRoundTwoPart()],
      [approvedRoundOneBudget(), pendingRoundTwoBudget()],
    );

    expect(() =>
      workOrder.withdrawParts({
        lines: [
          { itemId: APPROVED_ITEM_ID, quantity: 1 },
          { itemId: PENDING_ITEM_ID, quantity: 1 },
        ],
        actorUserId: MECHANIC_ID,
        now: NOW,
      }),
    ).toThrow(PartNotWithdrawableError);
    expect(workOrder.partItems.find((item) => item.id.equals(APPROVED_ITEM_ID))?.withdrawnQuantity).toBe(0);
  });

  it('leaves the first line untouched when the second line alone exceeds its own planned quantity', () => {
    // Both lines pass the round-approval guard - this isolates WithdrawalExceedsPlannedError as
    // the guard that fires on the second line, distinct from the previous test's round guard.
    // WorkOrderPartItem.withdraw carries the same planned-quantity check as a second line of
    // defense, so a test that lets either guard fire cannot tell them apart (validation.md's M3).
    const secondApprovedItem = WorkOrderPartItem.restore({
      id: PENDING_ITEM_ID,
      inventoryItemId: PENDING_INVENTORY_ITEM_ID,
      sku: 'BLT-002',
      itemName: 'Correia',
      unitPrice: Money.fromCents(4000),
      plannedQuantity: PlannedQuantity.create(1),
      withdrawnQuantity: 0,
      budgetRound: 1,
      budgetedUnitPrice: Money.fromCents(4000),
    });
    const workOrder = restoreInExecution(
      [approvedRoundOnePart(), secondApprovedItem],
      [approvedRoundOneBudget()],
    );

    expect(() =>
      workOrder.withdrawParts({
        lines: [
          { itemId: APPROVED_ITEM_ID, quantity: 1 },
          { itemId: PENDING_ITEM_ID, quantity: 2 },
        ],
        actorUserId: MECHANIC_ID,
        now: NOW,
      }),
    ).toThrow(WithdrawalExceedsPlannedError);
    expect(workOrder.partItems.find((item) => item.id.equals(APPROVED_ITEM_ID))?.withdrawnQuantity).toBe(0);
  });

  it('records exactly one PartWithdrawn for the whole batch, not one per line', () => {
    // Both items attached to the same approved round, so both lines are withdrawable in one call.
    const secondApprovedItem = WorkOrderPartItem.restore({
      id: PENDING_ITEM_ID,
      inventoryItemId: PENDING_INVENTORY_ITEM_ID,
      sku: 'BLT-002',
      itemName: 'Correia',
      unitPrice: Money.fromCents(4000),
      plannedQuantity: PlannedQuantity.create(1),
      withdrawnQuantity: 0,
      budgetRound: 1,
      budgetedUnitPrice: Money.fromCents(4000),
    });
    const workOrder = restoreInExecution(
      [approvedRoundOnePart(), secondApprovedItem],
      [approvedRoundOneBudget()],
    );

    workOrder.withdrawParts({
      lines: [
        { itemId: APPROVED_ITEM_ID, quantity: 1 },
        { itemId: PENDING_ITEM_ID, quantity: 1 },
      ],
      actorUserId: MECHANIC_ID,
      now: NOW,
    });

    const events = workOrder.pullDomainEvents();
    expect(events.filter((event) => event instanceof PartWithdrawn)).toHaveLength(1);
  });
});

describe('WorkOrder.returnParts', () => {
  const ITEM_A_ID = WorkOrderItemId.create('66666666-6666-4666-8666-666666666666');
  const ITEM_B_ID = WorkOrderItemId.create('77777777-7777-4777-8777-777777777777');
  const ITEM_A_INVENTORY_ID = '88888888-8888-4888-8888-888888888888';
  const ITEM_B_INVENTORY_ID = '99999999-9999-4999-8999-999999999999';

  function withdrawnPart(id: WorkOrderItemId, inventoryItemId: string, withdrawnQuantity: number): WorkOrderPartItem {
    return WorkOrderPartItem.restore({
      id,
      inventoryItemId,
      sku: 'FLT-001',
      itemName: 'Filtro de oleo',
      unitPrice: Money.fromCents(2500),
      plannedQuantity: PlannedQuantity.create(3),
      withdrawnQuantity,
      budgetRound: 1,
      budgetedUnitPrice: Money.fromCents(2500),
    });
  }

  function restoreInExecution(
    partItems: WorkOrderPartItem[],
    status: WorkOrderStatus = WorkOrderStatus.InExecution,
  ): WorkOrder {
    const budget = Budget.restore({
      id: BudgetId.create('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
      round: 1,
      total: Money.fromCents(7500),
      status: BudgetStatus.Approved,
      generatedAt: NOW,
      decidedAt: NOW,
      decidedByUserId: CUSTOMER_ID,
    });
    return WorkOrder.restore({
      id: WORK_ORDER_ID,
      number: WorkOrderNumber.create('A1B090-2026'),
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
      partItems,
      diagnosisStartedAt: NOW,
      diagnosisCompletedAt: NOW,
      budgets: [budget],
      budgetDecidedAt: NOW,
      budgetDecidedByUserId: CUSTOMER_ID,
      executionStartedAt: NOW,
    });
  }

  it('lowers the withdrawn quantity and returns the resolved inventory item id and quantity', () => {
    const workOrder = restoreInExecution([withdrawnPart(ITEM_A_ID, ITEM_A_INVENTORY_ID, 2)]);

    const resolved = workOrder.returnParts({
      lines: [{ itemId: ITEM_A_ID, quantity: 1 }],
      actorUserId: MECHANIC_ID,
      now: NOW,
    });

    expect(resolved).toEqual([{ inventoryItemId: ITEM_A_INVENTORY_ID, quantity: 1 }]);
    expect(workOrder.partItems[0].withdrawnQuantity).toBe(1);
  });

  it('refuses to return outside IN_EXECUTION', () => {
    const workOrder = restoreInExecution(
      [withdrawnPart(ITEM_A_ID, ITEM_A_INVENTORY_ID, 2)],
      WorkOrderStatus.AwaitingApproval,
    );

    expect(() =>
      workOrder.returnParts({
        lines: [{ itemId: ITEM_A_ID, quantity: 1 }],
        actorUserId: MECHANIC_ID,
        now: NOW,
      }),
    ).toThrow(WorkOrderStateError);
  });

  it('refuses a batch naming the same item twice with DuplicateBatchLineError', () => {
    const workOrder = restoreInExecution([withdrawnPart(ITEM_A_ID, ITEM_A_INVENTORY_ID, 2)]);

    expect(() =>
      workOrder.returnParts({
        lines: [
          { itemId: ITEM_A_ID, quantity: 1 },
          { itemId: ITEM_A_ID, quantity: 1 },
        ],
        actorUserId: MECHANIC_ID,
        now: NOW,
      }),
    ).toThrow(DuplicateBatchLineError);
  });

  it('refuses an item id that is not on this work order with WorkOrderItemNotFoundError', () => {
    const workOrder = restoreInExecution([withdrawnPart(ITEM_A_ID, ITEM_A_INVENTORY_ID, 2)]);
    const unknownId = WorkOrderItemId.create('cccccccc-cccc-4ccc-8ccc-cccccccccccc');

    expect(() =>
      workOrder.returnParts({
        lines: [{ itemId: unknownId, quantity: 1 }],
        actorUserId: MECHANIC_ID,
        now: NOW,
      }),
    ).toThrow(WorkOrderItemNotFoundError);
  });

  it('refuses returning more than was withdrawn with ReturnExceedsWithdrawnError, leaving it unchanged', () => {
    const workOrder = restoreInExecution([withdrawnPart(ITEM_A_ID, ITEM_A_INVENTORY_ID, 1)]);

    expect(() =>
      workOrder.returnParts({
        lines: [{ itemId: ITEM_A_ID, quantity: 2 }],
        actorUserId: MECHANIC_ID,
        now: NOW,
      }),
    ).toThrow(ReturnExceedsWithdrawnError);
    expect(workOrder.partItems[0].withdrawnQuantity).toBe(1);
  });

  it('leaves the first line untouched when only the second line alone exceeds what was withdrawn', () => {
    // WorkOrderPartItem.returnUnits carries the same below-zero check as a second line of
    // defense, so a test that lets either guard fire cannot tell them apart (validation.md's N1,
    // the return-side twin of the withdrawal-side M3 fix).
    const workOrder = restoreInExecution([
      withdrawnPart(ITEM_A_ID, ITEM_A_INVENTORY_ID, 2),
      withdrawnPart(ITEM_B_ID, ITEM_B_INVENTORY_ID, 1),
    ]);

    expect(() =>
      workOrder.returnParts({
        lines: [
          { itemId: ITEM_A_ID, quantity: 1 },
          { itemId: ITEM_B_ID, quantity: 2 },
        ],
        actorUserId: MECHANIC_ID,
        now: NOW,
      }),
    ).toThrow(ReturnExceedsWithdrawnError);
    expect(workOrder.partItems.find((item) => item.id.equals(ITEM_A_ID))?.withdrawnQuantity).toBe(2);
  });

  it('refuses an item that was never withdrawn on this work order', () => {
    const workOrder = restoreInExecution([withdrawnPart(ITEM_A_ID, ITEM_A_INVENTORY_ID, 0)]);

    expect(() =>
      workOrder.returnParts({
        lines: [{ itemId: ITEM_A_ID, quantity: 1 }],
        actorUserId: MECHANIC_ID,
        now: NOW,
      }),
    ).toThrow(ReturnExceedsWithdrawnError);
  });

  it('records exactly one PartReturned for the whole batch, not one per line', () => {
    const workOrder = restoreInExecution([
      withdrawnPart(ITEM_A_ID, ITEM_A_INVENTORY_ID, 2),
      withdrawnPart(ITEM_B_ID, ITEM_B_INVENTORY_ID, 1),
    ]);

    workOrder.returnParts({
      lines: [
        { itemId: ITEM_A_ID, quantity: 1 },
        { itemId: ITEM_B_ID, quantity: 1 },
      ],
      actorUserId: MECHANIC_ID,
      now: NOW,
    });

    const events = workOrder.pullDomainEvents();
    expect(events.filter((event) => event instanceof PartReturned)).toHaveLength(1);
  });
});

describe('WorkOrder closing props', () => {
  const ITEM_ID = WorkOrderItemId.create('66666666-6666-4666-8666-666666666666');
  const INVENTORY_ITEM_ID = '77777777-7777-4777-8777-777777777777';

  function partWithWithdrawn(withdrawnQuantity: number): WorkOrderPartItem {
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

  it('defaults every closing prop on a newly opened work order: null timestamps and actors, a zero discount, no charged total', () => {
    const workOrder = openWorkOrder();

    expect(workOrder.chargedTotal).toBeNull();
    expect(workOrder.discount.equals(Money.fromCents(0))).toBe(true);
    expect(workOrder.discountNote).toBeNull();
    expect(workOrder.discountAppliedByUserId).toBeNull();
    expect(workOrder.discountAppliedAt).toBeNull();
    expect(workOrder.completedAt).toBeNull();
    expect(workOrder.deliveredAt).toBeNull();
    expect(workOrder.deliveredByUserId).toBeNull();
    expect(workOrder.canceledAt).toBeNull();
    expect(workOrder.canceledByUserId).toBeNull();
    expect(workOrder.cancellationReason).toBeNull();
  });

  it('defaults the closing props the same way when restore omits them, so every pre-existing row loads exactly as it did before this feature', () => {
    const workOrder = restoreWorkOrder(WorkOrderStatus.Received);

    expect(workOrder.chargedTotal).toBeNull();
    expect(workOrder.discount.equals(Money.fromCents(0))).toBe(true);
    expect(workOrder.completedAt).toBeNull();
  });

  it('carries the closing props through restore unchanged when they are supplied', () => {
    const workOrder = WorkOrder.restore({
      id: WORK_ORDER_ID,
      number: WorkOrderNumber.create('A1B090-2026'),
      customerId: CUSTOMER_ID,
      vehicleId: VEHICLE_ID,
      assignedMechanicUserId: null,
      createdByUserId: CREATOR_ID,
      status: WorkOrderStatus.Completed,
      customerName: 'Jane Doe',
      vehiclePlate: 'ABC1234',
      vehicleBrand: 'Toyota',
      vehicleModel: 'Corolla',
      vehicleYear: 2020,
      createdAt: NOW,
      updatedAt: NOW,
      serviceItems: [],
      partItems: [],
      diagnosisStartedAt: null,
      diagnosisCompletedAt: null,
      budgets: [],
      budgetDecidedAt: null,
      budgetDecidedByUserId: null,
      executionStartedAt: null,
      chargedTotal: Money.fromCents(30000),
      discount: Money.fromCents(5000),
      discountNote: 'Preco combinado com o cliente',
      discountAppliedByUserId: CREATOR_ID,
      discountAppliedAt: NOW,
      completedAt: NOW,
      deliveredAt: null,
      deliveredByUserId: null,
      canceledAt: null,
      canceledByUserId: null,
      cancellationReason: null,
    });

    expect(workOrder.chargedTotal?.equals(Money.fromCents(30000))).toBe(true);
    expect(workOrder.discount.equals(Money.fromCents(5000))).toBe(true);
    expect(workOrder.discountNote).toBe('Preco combinado com o cliente');
    expect(workOrder.completedAt).toBe(NOW);
  });

  it('reports no outstanding withdrawal when every part item has withdrawn zero', () => {
    const workOrder = restoreInExecutionWithParts([partWithWithdrawn(0)]);

    expect(workOrder.hasOutstandingWithdrawals).toBe(false);
  });

  it('reports no outstanding withdrawal for a work order carrying no part item at all', () => {
    const workOrder = restoreInExecutionWithParts([]);

    expect(workOrder.hasOutstandingWithdrawals).toBe(false);
  });

  it('reports an outstanding withdrawal as soon as any part item has withdrawn more than zero', () => {
    const workOrder = restoreInExecutionWithParts([partWithWithdrawn(2)]);

    expect(workOrder.hasOutstandingWithdrawals).toBe(true);
  });

  function restoreInExecutionWithParts(partItems: WorkOrderPartItem[]): WorkOrder {
    return WorkOrder.restore({
      id: WORK_ORDER_ID,
      number: WorkOrderNumber.create('A1B090-2026'),
      customerId: CUSTOMER_ID,
      vehicleId: VEHICLE_ID,
      assignedMechanicUserId: MECHANIC_ID,
      createdByUserId: CREATOR_ID,
      status: WorkOrderStatus.InExecution,
      customerName: 'Jane Doe',
      vehiclePlate: 'ABC1234',
      vehicleBrand: 'Toyota',
      vehicleModel: 'Corolla',
      vehicleYear: 2020,
      createdAt: NOW,
      updatedAt: NOW,
      serviceItems: [],
      partItems,
      diagnosisStartedAt: NOW,
      diagnosisCompletedAt: NOW,
      budgets: [
        Budget.restore({
          id: BudgetId.create('88888888-8888-4888-8888-888888888888'),
          round: 1,
          total: Money.fromCents(7500),
          status: BudgetStatus.Approved,
          generatedAt: NOW,
          decidedAt: NOW,
          decidedByUserId: CUSTOMER_ID,
        }),
      ],
      budgetDecidedAt: NOW,
      budgetDecidedByUserId: CUSTOMER_ID,
      executionStartedAt: NOW,
    });
  }
});

describe('WorkOrder.applyDiscount', () => {
  const SERVICE_ITEM_ID = WorkOrderItemId.create('66666666-6666-4666-8666-666666666666');
  const PART_ITEM_ID = WorkOrderItemId.create('77777777-7777-4777-8777-777777777777');
  const INVENTORY_ITEM_ID = '88888888-8888-4888-8888-888888888888';
  // One approved-round service at 20000 and one approved-round part withdrawn 2 at 2500 each:
  // pre-discount total is 25000.
  const PRE_DISCOUNT_TOTAL_CENTS = 25000;

  function restoreWithChargedTotal(
    status: WorkOrderStatus,
    overrides: { chargedTotal?: Money | null; discount?: Money } = {},
  ): WorkOrder {
    return WorkOrder.restore({
      id: WORK_ORDER_ID,
      number: WorkOrderNumber.create('A1B090-2026'),
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
      serviceItems: [
        WorkOrderServiceItem.restore({
          id: SERVICE_ITEM_ID,
          serviceId: '99999999-9999-4999-8999-999999999999',
          serviceName: 'Alinhamento',
          unitPrice: Money.fromCents(20000),
          budgetRound: 1,
          budgetedUnitPrice: Money.fromCents(20000),
        }),
      ],
      partItems: [
        WorkOrderPartItem.restore({
          id: PART_ITEM_ID,
          inventoryItemId: INVENTORY_ITEM_ID,
          sku: 'FLT-001',
          itemName: 'Filtro de oleo',
          unitPrice: Money.fromCents(2500),
          plannedQuantity: PlannedQuantity.create(3),
          withdrawnQuantity: 2,
          budgetRound: 1,
          budgetedUnitPrice: Money.fromCents(2500),
        }),
      ],
      diagnosisStartedAt: NOW,
      diagnosisCompletedAt: NOW,
      budgets: [
        Budget.restore({
          id: BudgetId.create('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
          round: 1,
          total: Money.fromCents(25000),
          status: BudgetStatus.Approved,
          generatedAt: NOW,
          decidedAt: NOW,
          decidedByUserId: CUSTOMER_ID,
        }),
      ],
      budgetDecidedAt: NOW,
      budgetDecidedByUserId: CUSTOMER_ID,
      executionStartedAt: NOW,
      chargedTotal: overrides.chargedTotal,
      discount: overrides.discount,
    });
  }

  it('records the amount, note, actor and moment, and records DiscountApplied, from IN_EXECUTION', () => {
    const workOrder = restoreWithChargedTotal(WorkOrderStatus.InExecution);

    workOrder.applyDiscount({
      amount: Money.fromCents(5000),
      note: 'Combinado com o cliente',
      actorUserId: CREATOR_ID,
      now: NOW,
    });

    expect(workOrder.discount.equals(Money.fromCents(5000))).toBe(true);
    expect(workOrder.discountNote).toBe('Combinado com o cliente');
    expect(workOrder.discountAppliedByUserId).toBe(CREATOR_ID);
    expect(workOrder.discountAppliedAt).toBe(NOW);
    const events = workOrder.pullDomainEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toBeInstanceOf(DiscountApplied);
  });

  it('records the amount from COMPLETED too', () => {
    const workOrder = restoreWithChargedTotal(WorkOrderStatus.Completed, {
      chargedTotal: Money.fromCents(PRE_DISCOUNT_TOTAL_CENTS),
      discount: Money.fromCents(0),
    });

    workOrder.applyDiscount({
      amount: Money.fromCents(3000),
      note: 'Ajuste pos-conclusao',
      actorUserId: CREATOR_ID,
      now: NOW,
    });

    expect(workOrder.discount.equals(Money.fromCents(3000))).toBe(true);
  });

  it('refuses in any state other than IN_EXECUTION or COMPLETED', () => {
    const workOrder = restoreWithChargedTotal(WorkOrderStatus.AwaitingApproval);

    expect(() =>
      workOrder.applyDiscount({
        amount: Money.fromCents(1000),
        note: 'x',
        actorUserId: CREATOR_ID,
        now: NOW,
      }),
    ).toThrow(WorkOrderStateError);
  });

  it('refuses an amount above the pre-discount total', () => {
    const workOrder = restoreWithChargedTotal(WorkOrderStatus.InExecution);

    expect(() =>
      workOrder.applyDiscount({
        amount: Money.fromCents(PRE_DISCOUNT_TOTAL_CENTS + 1),
        note: 'x',
        actorUserId: CREATOR_ID,
        now: NOW,
      }),
    ).toThrow(DiscountExceedsChargedTotalError);
  });

  it('allows an amount exactly equal to the pre-discount total (L-009 boundary)', () => {
    const workOrder = restoreWithChargedTotal(WorkOrderStatus.InExecution);

    expect(() =>
      workOrder.applyDiscount({
        amount: Money.fromCents(PRE_DISCOUNT_TOTAL_CENTS),
        note: 'x',
        actorUserId: CREATOR_ID,
        now: NOW,
      }),
    ).not.toThrow();
  });

  it('refuses one cent above the pre-discount total (L-009 boundary, the other direction)', () => {
    const workOrder = restoreWithChargedTotal(WorkOrderStatus.InExecution);

    expect(() =>
      workOrder.applyDiscount({
        amount: Money.fromCents(PRE_DISCOUNT_TOTAL_CENTS + 1),
        note: 'x',
        actorUserId: CREATOR_ID,
        now: NOW,
      }),
    ).toThrow(DiscountExceedsChargedTotalError);
  });

  it('replaces the previous discount rather than accumulating it', () => {
    const workOrder = restoreWithChargedTotal(WorkOrderStatus.InExecution);
    workOrder.applyDiscount({
      amount: Money.fromCents(10000),
      note: 'Primeiro desconto',
      actorUserId: CREATOR_ID,
      now: NOW,
    });

    const later = new Date('2026-08-31T13:00:00.000Z');
    workOrder.applyDiscount({
      amount: Money.fromCents(8000),
      note: 'Segundo desconto',
      actorUserId: MECHANIC_ID,
      now: later,
    });

    expect(workOrder.discount.equals(Money.fromCents(8000))).toBe(true);
    expect(workOrder.discountNote).toBe('Segundo desconto');
    expect(workOrder.discountAppliedByUserId).toBe(MECHANIC_ID);
    expect(workOrder.discountAppliedAt).toBe(later);
  });

  it('recomputes and stores the charged total when applied while already COMPLETED', () => {
    const workOrder = restoreWithChargedTotal(WorkOrderStatus.Completed, {
      chargedTotal: Money.fromCents(PRE_DISCOUNT_TOTAL_CENTS),
      discount: Money.fromCents(0),
    });

    workOrder.applyDiscount({
      amount: Money.fromCents(3000),
      note: 'Ajuste pos-conclusao',
      actorUserId: CREATOR_ID,
      now: NOW,
    });

    expect(workOrder.chargedTotal?.equals(Money.fromCents(PRE_DISCOUNT_TOTAL_CENTS - 3000))).toBe(true);
  });
});

describe('WorkOrder.complete', () => {
  const APPROVED_BUDGET = Budget.restore({
    id: BudgetId.create('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    round: 1,
    total: Money.fromCents(25000),
    status: BudgetStatus.Approved,
    generatedAt: NOW,
    decidedAt: NOW,
    decidedByUserId: CUSTOMER_ID,
  });
  const REJECTED_BUDGET = Budget.restore({
    id: BudgetId.create('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
    round: 2,
    total: Money.fromCents(9999),
    status: BudgetStatus.Rejected,
    generatedAt: NOW,
    decidedAt: NOW,
    decidedByUserId: CUSTOMER_ID,
  });

  function service(id: string, priceCents: number, budgetRound: number | null): WorkOrderServiceItem {
    return WorkOrderServiceItem.restore({
      id: WorkOrderItemId.create(id),
      serviceId: '99999999-9999-4999-8999-999999999999',
      serviceName: 'Servico',
      unitPrice: Money.fromCents(priceCents),
      budgetRound,
      budgetedUnitPrice: budgetRound === null ? null : Money.fromCents(priceCents),
    });
  }

  function part(
    id: string,
    priceCents: number,
    withdrawnQuantity: number,
    budgetRound: number | null,
  ): WorkOrderPartItem {
    return WorkOrderPartItem.restore({
      id: WorkOrderItemId.create(id),
      inventoryItemId: '77777777-7777-4777-8777-777777777777',
      sku: 'FLT-001',
      itemName: 'Filtro de oleo',
      unitPrice: Money.fromCents(priceCents),
      plannedQuantity: PlannedQuantity.create(3),
      withdrawnQuantity,
      budgetRound,
      budgetedUnitPrice: budgetRound === null ? null : Money.fromCents(priceCents),
    });
  }

  function restoreInExecution(
    serviceItems: WorkOrderServiceItem[],
    partItems: WorkOrderPartItem[],
    budgets: Budget[] = [APPROVED_BUDGET],
    overrides: { status?: WorkOrderStatus; discount?: Money } = {},
  ): WorkOrder {
    return WorkOrder.restore({
      id: WORK_ORDER_ID,
      number: WorkOrderNumber.create('A1B090-2026'),
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
      serviceItems,
      partItems,
      diagnosisStartedAt: NOW,
      diagnosisCompletedAt: NOW,
      budgets,
      budgetDecidedAt: NOW,
      budgetDecidedByUserId: CUSTOMER_ID,
      executionStartedAt: NOW,
      discount: overrides.discount,
    });
  }

  it('moves IN_EXECUTION to COMPLETED, stamps completedAt and records WorkOrderCompleted', () => {
    const workOrder = restoreInExecution([service('11111111-1111-4111-8111-111111111111', 20000, 1)], []);

    workOrder.complete({ actorUserId: MECHANIC_ID, now: NOW });

    expect(workOrder.status).toBe(WorkOrderStatus.Completed);
    expect(workOrder.completedAt).toBe(NOW);
    const events = workOrder.pullDomainEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toBeInstanceOf(WorkOrderCompleted);
  });

  it('stores the pre-discount total minus the recorded discount as the charged total', () => {
    const workOrder = restoreInExecution(
      [service('11111111-1111-4111-8111-111111111111', 20000, 1)],
      [part('22222222-2222-4222-8222-222222222222', 2500, 2, 1)],
      [APPROVED_BUDGET],
      { discount: Money.fromCents(1000) },
    );

    workOrder.complete({ actorUserId: MECHANIC_ID, now: NOW });

    // 20000 (service) + 2 * 2500 (part) - 1000 (discount) = 24000
    expect(workOrder.chargedTotal?.equals(Money.fromCents(24000))).toBe(true);
  });

  it('stores the approved services alone for a work order with no part withdrawn (spec.md edge case)', () => {
    const workOrder = restoreInExecution(
      [service('11111111-1111-4111-8111-111111111111', 20000, 1)],
      [part('22222222-2222-4222-8222-222222222222', 2500, 0, 1)],
    );

    workOrder.complete({ actorUserId: MECHANIC_ID, now: NOW });

    expect(workOrder.chargedTotal?.equals(Money.fromCents(20000))).toBe(true);
  });

  it('adds nothing for an item on a rejected round, and nothing for an item on no round at all', () => {
    const workOrder = restoreInExecution(
      [
        service('11111111-1111-4111-8111-111111111111', 20000, 1),
        service('33333333-3333-4333-8333-333333333333', 9999, 2),
        service('44444444-4444-4444-8444-444444444444', 5000, null),
      ],
      [],
      [APPROVED_BUDGET, REJECTED_BUDGET],
    );

    workOrder.complete({ actorUserId: MECHANIC_ID, now: NOW });

    expect(workOrder.chargedTotal?.equals(Money.fromCents(20000))).toBe(true);
  });

  it('sums the whole collection, not just its first row, across two services and two part items (L-014)', () => {
    const workOrder = restoreInExecution(
      [
        service('11111111-1111-4111-8111-111111111111', 20000, 1),
        service('33333333-3333-4333-8333-333333333333', 15000, 1),
      ],
      [
        part('22222222-2222-4222-8222-222222222222', 2500, 2, 1),
        part('55555555-5555-4555-8555-555555555555', 4000, 1, 1),
      ],
    );

    workOrder.complete({ actorUserId: MECHANIC_ID, now: NOW });

    // 20000 + 15000 + 2*2500 + 1*4000 = 44000
    expect(workOrder.chargedTotal?.equals(Money.fromCents(44000))).toBe(true);
  });

  it('refuses when the recorded discount exceeds the pre-discount total, leaving IN_EXECUTION (spec.md edge case)', () => {
    const workOrder = restoreInExecution(
      [service('11111111-1111-4111-8111-111111111111', 20000, 1)],
      [],
      [APPROVED_BUDGET],
      { discount: Money.fromCents(20001) },
    );

    expect(() => workOrder.complete({ actorUserId: MECHANIC_ID, now: NOW })).toThrow(
      DiscountExceedsChargedTotalError,
    );
    expect(workOrder.status).toBe(WorkOrderStatus.InExecution);
  });

  it('refuses a discount that was valid when applied but a later return dropped the total below it (L-008)', () => {
    // applyDiscount accepted 21000 against a total of 25000 (service 20000 + part 2*2500). A
    // return then drops the part's withdrawn quantity to 0, leaving only the 20000 service - now
    // 21000 exceeds it. complete's own revalidation is the only guard that can still catch this.
    const workOrder = restoreInExecution(
      [service('11111111-1111-4111-8111-111111111111', 20000, 1)],
      [part('22222222-2222-4222-8222-222222222222', 2500, 0, 1)],
      [APPROVED_BUDGET],
      { discount: Money.fromCents(21000) },
    );

    expect(() => workOrder.complete({ actorUserId: MECHANIC_ID, now: NOW })).toThrow(
      DiscountExceedsChargedTotalError,
    );
  });

  it('refuses from any state other than IN_EXECUTION', () => {
    const workOrder = restoreInExecution([], [], [APPROVED_BUDGET], {
      status: WorkOrderStatus.AwaitingApproval,
    });

    expect(() => workOrder.complete({ actorUserId: MECHANIC_ID, now: NOW })).toThrow(WorkOrderStateError);
  });
});

describe('WorkOrder.deliver', () => {
  function restoreAt(status: WorkOrderStatus): WorkOrder {
    return WorkOrder.restore({
      id: WORK_ORDER_ID,
      number: WorkOrderNumber.create('A1B090-2026'),
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

  it('moves COMPLETED to DELIVERED, stamps deliveredAt and deliveredByUserId, and records VehicleDelivered', () => {
    const workOrder = restoreAt(WorkOrderStatus.Completed);

    workOrder.deliver({ actorUserId: CREATOR_ID, now: NOW });

    expect(workOrder.status).toBe(WorkOrderStatus.Delivered);
    expect(workOrder.deliveredAt).toBe(NOW);
    expect(workOrder.deliveredByUserId).toBe(CREATOR_ID);
    const events = workOrder.pullDomainEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toBeInstanceOf(VehicleDelivered);
  });

  it('refuses from RECEIVED (spec.md edge case)', () => {
    const workOrder = restoreAt(WorkOrderStatus.Received);

    expect(() => workOrder.deliver({ actorUserId: CREATOR_ID, now: NOW })).toThrow(WorkOrderStateError);
  });

  it('refuses from IN_EXECUTION', () => {
    const workOrder = restoreAt(WorkOrderStatus.InExecution);

    expect(() => workOrder.deliver({ actorUserId: CREATOR_ID, now: NOW })).toThrow(WorkOrderStateError);
  });

  it('refuses from DELIVERED and from CANCELED', () => {
    expect(() => restoreAt(WorkOrderStatus.Delivered).deliver({ actorUserId: CREATOR_ID, now: NOW })).toThrow(
      WorkOrderStateError,
    );
    expect(() => restoreAt(WorkOrderStatus.Canceled).deliver({ actorUserId: CREATOR_ID, now: NOW })).toThrow(
      WorkOrderStateError,
    );
  });

  it('leaves the charged total exactly as completion froze it', () => {
    const workOrder = restoreAt(WorkOrderStatus.Completed);

    workOrder.deliver({ actorUserId: CREATOR_ID, now: NOW });

    expect(workOrder.chargedTotal?.equals(Money.fromCents(20000))).toBe(true);
  });
});
