import { describe, expect, it } from 'vitest';
import { PartReturned } from './part-returned.event';
import { PartWithdrawn } from './part-withdrawn.event';

const WORK_ORDER_ID = '11111111-1111-4111-8111-111111111111';
const ACTOR_ID = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-08-31T12:00:00.000Z');

describe('PartWithdrawn', () => {
  it('carries a distinct literal eventType, no status move, the work order id, the actor and the moment', () => {
    const event = new PartWithdrawn(WORK_ORDER_ID, ACTOR_ID, NOW);

    expect(event.eventType).toBe('PART_WITHDRAWN');
    expect(event.fromStatus).toBeNull();
    expect(event.toStatus).toBeNull();
    expect(event.workOrderId).toBe(WORK_ORDER_ID);
    expect(event.actorUserId).toBe(ACTOR_ID);
    expect(event.occurredAt).toBe(NOW);
  });
});

describe('PartReturned', () => {
  it('carries a distinct literal eventType, no status move, the work order id, the actor and the moment', () => {
    const event = new PartReturned(WORK_ORDER_ID, ACTOR_ID, NOW);

    expect(event.eventType).toBe('PART_RETURNED');
    expect(event.fromStatus).toBeNull();
    expect(event.toStatus).toBeNull();
    expect(event.workOrderId).toBe(WORK_ORDER_ID);
    expect(event.actorUserId).toBe(ACTOR_ID);
    expect(event.occurredAt).toBe(NOW);
  });
});

describe('the two constants', () => {
  it('are distinct from each other and from the thirteen the module already exports', () => {
    const existing = [
      'DIAGNOSIS_COMPLETED', 'BUDGET_REJECTED', 'BUDGET_GENERATED', 'BUDGET_APPROVED',
      'DIAGNOSIS_STARTED', 'SUPPLEMENTARY_BUDGET_GENERATED', 'SERVICE_ADDED_TO_WORK_ORDER',
      'ITEM_REMOVED_FROM_WORK_ORDER', 'EXECUTION_STARTED', 'BUDGET_SENT',
      'WORK_ORDER_CREATED', 'MECHANIC_ASSIGNED', 'PART_PLANNED_FOR_WORK_ORDER',
    ];
    const mine = [new PartWithdrawn(WORK_ORDER_ID, ACTOR_ID, NOW).eventType, new PartReturned(WORK_ORDER_ID, ACTOR_ID, NOW).eventType];

    expect(new Set([...existing, ...mine]).size).toBe(existing.length + mine.length);
  });
});
