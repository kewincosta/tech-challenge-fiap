import { describe, expect, it } from 'vitest';
import { WorkOrderStatus } from '../work-order-status';
import { ItemRemovedFromWorkOrder } from './item-removed-from-work-order.event';
import { MechanicAssigned } from './mechanic-assigned.event';
import { PartPlannedForWorkOrder } from './part-planned-for-work-order.event';
import { ServiceAddedToWorkOrder } from './service-added-to-work-order.event';
import { WorkOrderCreated } from './work-order-created.event';

const WORK_ORDER_ID = '11111111-1111-4111-8111-111111111111';
const ACTOR_ID = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-08-31T12:00:00.000Z');

describe('WorkOrderStatus', () => {
  it('should carry all seven states', () => {
    expect(Object.values(WorkOrderStatus)).toEqual([
      'RECEIVED',
      'IN_DIAGNOSIS',
      'AWAITING_APPROVAL',
      'IN_EXECUTION',
      'COMPLETED',
      'DELIVERED',
      'CANCELED',
    ]);
  });
});

describe('WorkOrderCreated', () => {
  it('should carry a distinct literal eventType, the work order id, the actor, the moment, a null fromStatus and toStatus RECEIVED', () => {
    const event = new WorkOrderCreated(WORK_ORDER_ID, ACTOR_ID, NOW);

    expect(event.eventType).toBe('WORK_ORDER_CREATED');
    expect(event.workOrderId).toBe(WORK_ORDER_ID);
    expect(event.actorUserId).toBe(ACTOR_ID);
    expect(event.occurredAt).toBe(NOW);
    expect(event.fromStatus).toBeNull();
    expect(event.toStatus).toBe(WorkOrderStatus.Received);
  });
});

describe('ServiceAddedToWorkOrder', () => {
  it('should carry a distinct literal eventType, the work order id, the actor and the moment', () => {
    const event = new ServiceAddedToWorkOrder(WORK_ORDER_ID, ACTOR_ID, NOW);

    expect(event.eventType).toBe('SERVICE_ADDED_TO_WORK_ORDER');
    expect(event.workOrderId).toBe(WORK_ORDER_ID);
    expect(event.actorUserId).toBe(ACTOR_ID);
    expect(event.occurredAt).toBe(NOW);
  });
});

describe('PartPlannedForWorkOrder', () => {
  it('should carry a distinct literal eventType, the work order id, the actor and the moment', () => {
    const event = new PartPlannedForWorkOrder(WORK_ORDER_ID, ACTOR_ID, NOW);

    expect(event.eventType).toBe('PART_PLANNED_FOR_WORK_ORDER');
    expect(event.workOrderId).toBe(WORK_ORDER_ID);
    expect(event.actorUserId).toBe(ACTOR_ID);
    expect(event.occurredAt).toBe(NOW);
  });
});

describe('ItemRemovedFromWorkOrder', () => {
  it('should carry a distinct literal eventType, the work order id, the actor and the moment', () => {
    const event = new ItemRemovedFromWorkOrder(WORK_ORDER_ID, ACTOR_ID, NOW);

    expect(event.eventType).toBe('ITEM_REMOVED_FROM_WORK_ORDER');
    expect(event.workOrderId).toBe(WORK_ORDER_ID);
    expect(event.actorUserId).toBe(ACTOR_ID);
    expect(event.occurredAt).toBe(NOW);
  });
});

describe('MechanicAssigned', () => {
  it('should carry a distinct literal eventType, the work order id, the actor and the moment', () => {
    const event = new MechanicAssigned(WORK_ORDER_ID, ACTOR_ID, NOW);

    expect(event.eventType).toBe('MECHANIC_ASSIGNED');
    expect(event.workOrderId).toBe(WORK_ORDER_ID);
    expect(event.actorUserId).toBe(ACTOR_ID);
    expect(event.occurredAt).toBe(NOW);
  });
});
