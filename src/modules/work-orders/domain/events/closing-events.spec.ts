import { describe, expect, it } from 'vitest';
import { WorkOrderStatus } from '../work-order-status';
import { DiscountApplied } from './discount-applied.event';
import { VehicleDelivered } from './vehicle-delivered.event';
import { WorkOrderCanceled } from './work-order-canceled.event';
import { WorkOrderCompleted } from './work-order-completed.event';

const WORK_ORDER_ID = '11111111-1111-4111-8111-111111111111';
const ACTOR_ID = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-08-31T12:00:00.000Z');

describe('WorkOrderCompleted', () => {
  it('carries a distinct literal eventType, IN_EXECUTION to COMPLETED, the work order id, the actor and the moment', () => {
    const event = new WorkOrderCompleted(WORK_ORDER_ID, ACTOR_ID, NOW);

    expect(event.eventType).toBe('WORK_ORDER_COMPLETED');
    expect(event.fromStatus).toBe(WorkOrderStatus.InExecution);
    expect(event.toStatus).toBe(WorkOrderStatus.Completed);
    expect(event.workOrderId).toBe(WORK_ORDER_ID);
    expect(event.actorUserId).toBe(ACTOR_ID);
    expect(event.occurredAt).toBe(NOW);
  });
});

describe('VehicleDelivered', () => {
  it('carries a distinct literal eventType, COMPLETED to DELIVERED, the work order id, the actor and the moment', () => {
    const event = new VehicleDelivered(WORK_ORDER_ID, ACTOR_ID, NOW);

    expect(event.eventType).toBe('VEHICLE_DELIVERED');
    expect(event.fromStatus).toBe(WorkOrderStatus.Completed);
    expect(event.toStatus).toBe(WorkOrderStatus.Delivered);
    expect(event.workOrderId).toBe(WORK_ORDER_ID);
    expect(event.actorUserId).toBe(ACTOR_ID);
    expect(event.occurredAt).toBe(NOW);
  });
});

describe('WorkOrderCanceled', () => {
  it('carries a distinct literal eventType, the state it left, to CANCELED, the work order id, the actor and the moment', () => {
    const event = new WorkOrderCanceled(WORK_ORDER_ID, ACTOR_ID, WorkOrderStatus.InExecution, NOW);

    expect(event.eventType).toBe('WORK_ORDER_CANCELED');
    expect(event.fromStatus).toBe(WorkOrderStatus.InExecution);
    expect(event.toStatus).toBe(WorkOrderStatus.Canceled);
    expect(event.workOrderId).toBe(WORK_ORDER_ID);
    expect(event.actorUserId).toBe(ACTOR_ID);
    expect(event.occurredAt).toBe(NOW);
  });

  it('names whichever state it actually left, not a fixed one', () => {
    const fromReceived = new WorkOrderCanceled(
      WORK_ORDER_ID,
      ACTOR_ID,
      WorkOrderStatus.Received,
      NOW,
    );
    const fromAwaitingApproval = new WorkOrderCanceled(
      WORK_ORDER_ID,
      ACTOR_ID,
      WorkOrderStatus.AwaitingApproval,
      NOW,
    );

    expect(fromReceived.fromStatus).toBe(WorkOrderStatus.Received);
    expect(fromAwaitingApproval.fromStatus).toBe(WorkOrderStatus.AwaitingApproval);
  });
});

describe('DiscountApplied', () => {
  it('carries a distinct literal eventType, no status move, the work order id, the actor and the moment', () => {
    const event = new DiscountApplied(WORK_ORDER_ID, ACTOR_ID, NOW);

    expect(event.eventType).toBe('DISCOUNT_APPLIED');
    expect(event.fromStatus).toBeNull();
    expect(event.toStatus).toBeNull();
    expect(event.workOrderId).toBe(WORK_ORDER_ID);
    expect(event.actorUserId).toBe(ACTOR_ID);
    expect(event.occurredAt).toBe(NOW);
  });
});

describe('the four constants', () => {
  it('are distinct from each other and from the fifteen the module already exports', () => {
    const existing = [
      'DIAGNOSIS_COMPLETED',
      'BUDGET_REJECTED',
      'BUDGET_GENERATED',
      'BUDGET_APPROVED',
      'DIAGNOSIS_STARTED',
      'SUPPLEMENTARY_BUDGET_GENERATED',
      'SERVICE_ADDED_TO_WORK_ORDER',
      'ITEM_REMOVED_FROM_WORK_ORDER',
      'EXECUTION_STARTED',
      'BUDGET_SENT',
      'WORK_ORDER_CREATED',
      'MECHANIC_ASSIGNED',
      'PART_PLANNED_FOR_WORK_ORDER',
      'PART_WITHDRAWN',
      'PART_RETURNED',
    ];
    const mine = [
      new WorkOrderCompleted(WORK_ORDER_ID, ACTOR_ID, NOW).eventType,
      new VehicleDelivered(WORK_ORDER_ID, ACTOR_ID, NOW).eventType,
      new WorkOrderCanceled(WORK_ORDER_ID, ACTOR_ID, WorkOrderStatus.InExecution, NOW).eventType,
      new DiscountApplied(WORK_ORDER_ID, ACTOR_ID, NOW).eventType,
    ];

    expect(new Set([...existing, ...mine]).size).toBe(existing.length + mine.length);
  });
});
