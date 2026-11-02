import { describe, expect, it } from 'vitest';
import { Money } from '../../../../shared/domain/value-objects/money';
import { BudgetApproved } from '../events/budget-approved.event';
import { ExecutionStarted } from '../events/execution-started.event';
import { WorkOrderStatusChanged } from '../events/work-order-status-changed.event';
import { BudgetId } from '../value-objects/budget-id';
import { PlannedQuantity } from '../value-objects/planned-quantity';
import { WorkOrderId } from '../value-objects/work-order-id';
import { WorkOrderItemId } from '../value-objects/work-order-item-id';
import { WorkOrderNumber } from '../value-objects/work-order-number';
import { WorkOrderStatus } from '../work-order-status';
import { WorkOrder } from './work-order';

const WORK_ORDER_ID = WorkOrderId.create('11111111-1111-4111-8111-111111111111');
const NUMBER = 'A1B090-2026';
const CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';
const VEHICLE_ID = '33333333-3333-4333-8333-333333333333';
const CREATOR_ID = '44444444-4444-4444-8444-444444444444';
const MECHANIC_ID = '55555555-5555-4555-8555-555555555555';
const OPENED_AT = new Date('2026-08-31T12:00:00.000Z');
const NOW = new Date('2026-09-01T09:30:00.000Z');
const ROUND_ONE_ID = BudgetId.create('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
const ROUND_TWO_ID = BudgetId.create('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

let itemSequence = 0;

function nextItemId(): WorkOrderItemId {
  itemSequence += 1;
  return WorkOrderItemId.create(
    `cccccccc-cccc-4ccc-8ccc-${String(itemSequence).padStart(12, '0')}`,
  );
}

function open(): WorkOrder {
  return WorkOrder.open({
    id: WORK_ORDER_ID,
    number: WorkOrderNumber.create(NUMBER),
    customerId: CUSTOMER_ID,
    vehicleId: VEHICLE_ID,
    createdByUserId: CREATOR_ID,
    customerName: 'Jane Doe',
    vehiclePlate: 'ABC1234',
    vehicleBrand: 'Toyota',
    vehicleModel: 'Corolla',
    vehicleYear: 2020,
    now: OPENED_AT,
  });
}

/** Adds a service of 150.99 and a part of 2 x 25.00, both draft items. */
function addItems(workOrder: WorkOrder): WorkOrder {
  workOrder.addService({
    itemId: nextItemId(),
    serviceId: '77777777-7777-4777-8777-777777777777',
    serviceName: 'Troca de oleo',
    unitPrice: Money.fromCents(15099),
    actorUserId: CREATOR_ID,
    now: OPENED_AT,
  });
  workOrder.planPart({
    itemId: nextItemId(),
    inventoryItemId: '88888888-8888-4888-8888-888888888888',
    sku: 'FLT-001',
    itemName: 'Filtro de oleo',
    unitPrice: Money.fromCents(2500),
    plannedQuantity: PlannedQuantity.create(2),
    actorUserId: CREATOR_ID,
    now: OPENED_AT,
  });
  return workOrder;
}

function inDiagnosis(): WorkOrder {
  const workOrder = addItems(open());
  workOrder.startDiagnosis({ actorUserId: MECHANIC_ID, now: OPENED_AT });
  return workOrder;
}

function awaitingApprovalOnRoundOne(): WorkOrder {
  const workOrder = inDiagnosis();
  workOrder.completeDiagnosis({ budgetId: ROUND_ONE_ID, actorUserId: MECHANIC_ID, now: OPENED_AT });
  return workOrder;
}

function inExecution(): WorkOrder {
  const workOrder = awaitingApprovalOnRoundOne();
  workOrder.approveBudget({ actorUserId: CUSTOMER_ID, now: OPENED_AT });
  return workOrder;
}

function awaitingApprovalOnRoundTwo(): WorkOrder {
  const workOrder = addItems(inExecution());
  workOrder.submitSupplementaryBudget({
    budgetId: ROUND_TWO_ID,
    actorUserId: MECHANIC_ID,
    now: OPENED_AT,
  });
  return workOrder;
}

function completed(): WorkOrder {
  const workOrder = inExecution();
  workOrder.complete({ actorUserId: MECHANIC_ID, now: OPENED_AT });
  return workOrder;
}

interface Transition {
  name: string;
  from: WorkOrderStatus | null;
  to: WorkOrderStatus;
  /** Builds the work order in its starting state, with no event pending, then makes the move. */
  move: () => WorkOrder;
}

function afterBuilding(build: () => WorkOrder, act: (workOrder: WorkOrder) => void): WorkOrder {
  const workOrder = build();
  workOrder.pullDomainEvents();
  act(workOrder);
  return workOrder;
}

const cancellation = { reason: 'Cliente desistiu', actorUserId: CREATOR_ID, now: NOW };

// The thirteen moves of the plan's state diagram: its twelve arrows, with the arrow into
// IN_EXECUTION counted twice because an approval and the rejection of a later round both take it.
const TRANSITIONS: Transition[] = [
  {
    name: 'the opening',
    from: null,
    to: WorkOrderStatus.Received,
    move: open,
  },
  {
    name: 'the diagnosis starts',
    from: WorkOrderStatus.Received,
    to: WorkOrderStatus.InDiagnosis,
    move: () =>
      afterBuilding(
        () => addItems(open()),
        (workOrder) => workOrder.startDiagnosis({ actorUserId: MECHANIC_ID, now: NOW }),
      ),
  },
  {
    name: 'the diagnosis completes',
    from: WorkOrderStatus.InDiagnosis,
    to: WorkOrderStatus.AwaitingApproval,
    move: () =>
      afterBuilding(inDiagnosis, (workOrder) =>
        workOrder.completeDiagnosis({ budgetId: ROUND_ONE_ID, actorUserId: MECHANIC_ID, now: NOW }),
      ),
  },
  {
    name: 'the budget is approved',
    from: WorkOrderStatus.AwaitingApproval,
    to: WorkOrderStatus.InExecution,
    move: () =>
      afterBuilding(awaitingApprovalOnRoundOne, (workOrder) =>
        workOrder.approveBudget({ actorUserId: CUSTOMER_ID, now: NOW }),
      ),
  },
  {
    name: 'a later round is rejected',
    from: WorkOrderStatus.AwaitingApproval,
    to: WorkOrderStatus.InExecution,
    move: () =>
      afterBuilding(awaitingApprovalOnRoundTwo, (workOrder) =>
        workOrder.rejectBudget({ actorUserId: CUSTOMER_ID, now: NOW }),
      ),
  },
  {
    name: 'round 1 is rejected',
    from: WorkOrderStatus.AwaitingApproval,
    to: WorkOrderStatus.InDiagnosis,
    move: () =>
      afterBuilding(awaitingApprovalOnRoundOne, (workOrder) =>
        workOrder.rejectBudget({ actorUserId: CUSTOMER_ID, now: NOW }),
      ),
  },
  {
    name: 'a supplementary round is sent',
    from: WorkOrderStatus.InExecution,
    to: WorkOrderStatus.AwaitingApproval,
    move: () =>
      afterBuilding(
        () => addItems(inExecution()),
        (workOrder) =>
          workOrder.submitSupplementaryBudget({
            budgetId: ROUND_TWO_ID,
            actorUserId: MECHANIC_ID,
            now: NOW,
          }),
      ),
  },
  {
    name: 'the work order is completed',
    from: WorkOrderStatus.InExecution,
    to: WorkOrderStatus.Completed,
    move: () =>
      afterBuilding(inExecution, (workOrder) =>
        workOrder.complete({ actorUserId: MECHANIC_ID, now: NOW }),
      ),
  },
  {
    name: 'the vehicle is delivered',
    from: WorkOrderStatus.Completed,
    to: WorkOrderStatus.Delivered,
    move: () =>
      afterBuilding(completed, (workOrder) =>
        workOrder.deliver({ actorUserId: CREATOR_ID, now: NOW }),
      ),
  },
  {
    name: 'a RECEIVED work order is canceled',
    from: WorkOrderStatus.Received,
    to: WorkOrderStatus.Canceled,
    move: () => afterBuilding(open, (workOrder) => workOrder.cancel(cancellation)),
  },
  {
    name: 'an IN_DIAGNOSIS work order is canceled',
    from: WorkOrderStatus.InDiagnosis,
    to: WorkOrderStatus.Canceled,
    move: () => afterBuilding(inDiagnosis, (workOrder) => workOrder.cancel(cancellation)),
  },
  {
    name: 'an AWAITING_APPROVAL work order is canceled',
    from: WorkOrderStatus.AwaitingApproval,
    to: WorkOrderStatus.Canceled,
    move: () =>
      afterBuilding(awaitingApprovalOnRoundOne, (workOrder) => workOrder.cancel(cancellation)),
  },
  {
    name: 'an IN_EXECUTION work order is canceled',
    from: WorkOrderStatus.InExecution,
    to: WorkOrderStatus.Canceled,
    move: () => afterBuilding(inExecution, (workOrder) => workOrder.cancel(cancellation)),
  },
];

function statusChangesOf(workOrder: WorkOrder): WorkOrderStatusChanged[] {
  return workOrder
    .pullDomainEvents()
    .filter((event): event is WorkOrderStatusChanged => event instanceof WorkOrderStatusChanged);
}

describe('WorkOrder status change events', () => {
  it('records one status change event per transition', () => {
    expect(TRANSITIONS).toHaveLength(13);

    for (const transition of TRANSITIONS) {
      const statusChanges = statusChangesOf(transition.move());

      expect(statusChanges, transition.name).toHaveLength(1);
      expect(statusChanges[0].fromStatus, transition.name).toBe(transition.from);
      expect(statusChanges[0].toStatus, transition.name).toBe(transition.to);
    }
  });

  it('records one status change event for an approval, though it also records BudgetApproved and ExecutionStarted', () => {
    const workOrder = afterBuilding(awaitingApprovalOnRoundOne, (awaiting) =>
      awaiting.approveBudget({ actorUserId: CUSTOMER_ID, now: NOW }),
    );

    const events = workOrder.pullDomainEvents();

    expect(events.filter((event) => event instanceof BudgetApproved)).toHaveLength(1);
    expect(events.filter((event) => event instanceof ExecutionStarted)).toHaveLength(1);
    expect(events.filter((event) => event instanceof WorkOrderStatusChanged)).toHaveLength(1);
    expect(events).toHaveLength(3);
  });

  it('carries the work order, the customer, the plate and the moment of the change', () => {
    const [change] = statusChangesOf(
      afterBuilding(inExecution, (workOrder) =>
        workOrder.complete({ actorUserId: MECHANIC_ID, now: NOW }),
      ),
    );

    expect(change).toMatchObject({
      workOrderId: WORK_ORDER_ID.value,
      workOrderNumber: NUMBER,
      customerId: CUSTOMER_ID,
      vehiclePlate: 'ABC1234',
      budgetToDecide: null,
      occurredAt: NOW,
    });
  });

  it('carries the pending budget when the work order now awaits approval, and none otherwise', () => {
    const [roundOne] = statusChangesOf(
      afterBuilding(inDiagnosis, (workOrder) =>
        workOrder.completeDiagnosis({ budgetId: ROUND_ONE_ID, actorUserId: MECHANIC_ID, now: NOW }),
      ),
    );
    const [roundTwo] = statusChangesOf(
      afterBuilding(
        () => addItems(inExecution()),
        (workOrder) =>
          workOrder.submitSupplementaryBudget({
            budgetId: ROUND_TWO_ID,
            actorUserId: MECHANIC_ID,
            now: NOW,
          }),
      ),
    );
    const [approved] = statusChangesOf(
      afterBuilding(awaitingApprovalOnRoundOne, (workOrder) =>
        workOrder.approveBudget({ actorUserId: CUSTOMER_ID, now: NOW }),
      ),
    );

    // 150.99 for the service and 2 x 25.00 for the part, then 150.99 and 2 x 25.00 again.
    expect(roundOne.budgetToDecide).toEqual({
      id: ROUND_ONE_ID.value,
      totalCents: 20099,
      generatedAt: NOW,
    });
    expect(roundTwo.budgetToDecide).toEqual({
      id: ROUND_TWO_ID.value,
      totalCents: 20099,
      generatedAt: NOW,
    });
    expect(approved.budgetToDecide).toBeNull();
  });

  it('carries the new generation, under the same id, when round 1 is generated again after a rejection', () => {
    const [first] = statusChangesOf(
      afterBuilding(inDiagnosis, (workOrder) =>
        workOrder.completeDiagnosis({
          budgetId: ROUND_ONE_ID,
          actorUserId: MECHANIC_ID,
          now: OPENED_AT,
        }),
      ),
    );
    const [again] = statusChangesOf(
      afterBuilding(
        () => {
          const workOrder = awaitingApprovalOnRoundOne();
          workOrder.rejectBudget({ actorUserId: CUSTOMER_ID, now: OPENED_AT });
          return workOrder;
        },
        (workOrder) =>
          workOrder.completeDiagnosis({
            budgetId: ROUND_TWO_ID,
            actorUserId: MECHANIC_ID,
            now: NOW,
          }),
      ),
    );

    expect(first.budgetToDecide).toMatchObject({ id: ROUND_ONE_ID.value, generatedAt: OPENED_AT });
    expect(again.budgetToDecide).toMatchObject({ id: ROUND_ONE_ID.value, generatedAt: NOW });
  });

  it('records none for an action that keeps the status, nor for a transition the status refuses', () => {
    const workOrder = inExecution();
    workOrder.pullDomainEvents();

    workOrder.assignMechanic({ mechanicUserId: MECHANIC_ID, actorUserId: CREATOR_ID, now: NOW });
    addItems(workOrder);
    expect(() => workOrder.startDiagnosis({ actorUserId: MECHANIC_ID, now: NOW })).toThrow();
    expect(() => workOrder.deliver({ actorUserId: CREATOR_ID, now: NOW })).toThrow();

    expect(statusChangesOf(workOrder)).toHaveLength(0);
  });
});
