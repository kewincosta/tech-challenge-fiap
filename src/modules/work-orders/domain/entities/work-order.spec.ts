import { describe, expect, it } from 'vitest';
import { Money } from '../../../../shared/domain/value-objects/money';
import { BudgetStatus } from '../budget-status';
import { BudgetedItemNotRemovableError } from '../errors/budgeted-item-not-removable.error';
import { DiagnosisWithoutItemsError } from '../errors/diagnosis-without-items.error';
import { EmptyDraftBudgetError } from '../errors/empty-draft-budget.error';
import { WorkOrderItemNotFoundError } from '../errors/work-order-item-not-found.error';
import { WorkOrderStateError } from '../errors/work-order-state.error';
import { BudgetApproved } from '../events/budget-approved.event';
import { BudgetGenerated } from '../events/budget-generated.event';
import { BudgetRejected } from '../events/budget-rejected.event';
import { BudgetSent } from '../events/budget-sent.event';
import { DiagnosisCompleted } from '../events/diagnosis-completed.event';
import { DiagnosisStarted } from '../events/diagnosis-started.event';
import { ExecutionStarted } from '../events/execution-started.event';
import { ItemRemovedFromWorkOrder } from '../events/item-removed-from-work-order.event';
import { MechanicAssigned } from '../events/mechanic-assigned.event';
import { PartPlannedForWorkOrder } from '../events/part-planned-for-work-order.event';
import { ServiceAddedToWorkOrder } from '../events/service-added-to-work-order.event';
import { SupplementaryBudgetGenerated } from '../events/supplementary-budget-generated.event';
import { WorkOrderCreated } from '../events/work-order-created.event';
import { BudgetId } from '../value-objects/budget-id';
import { PlannedQuantity } from '../value-objects/planned-quantity';
import { WorkOrderId } from '../value-objects/work-order-id';
import { WorkOrderItemId } from '../value-objects/work-order-item-id';
import { WorkOrderNumber } from '../value-objects/work-order-number';
import { WorkOrderStatus } from '../work-order-status';
import { Budget } from './budget';
import { WorkOrder } from './work-order';
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
