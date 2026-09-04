import { describe, expect, it } from 'vitest';
import { WorkOrderStatus } from '../work-order-status';
import { BudgetApproved } from './budget-approved.event';
import { BudgetGenerated } from './budget-generated.event';
import { BudgetRejected } from './budget-rejected.event';
import { BudgetSent } from './budget-sent.event';
import { DiagnosisCompleted } from './diagnosis-completed.event';
import { DiagnosisStarted } from './diagnosis-started.event';
import { ExecutionStarted } from './execution-started.event';
import { SupplementaryBudgetGenerated } from './supplementary-budget-generated.event';

const WORK_ORDER_ID = '11111111-1111-4111-8111-111111111111';
const ACTOR_ID = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-08-31T12:00:00.000Z');

const EIGHT_LITERALS = [
  'DIAGNOSIS_STARTED',
  'DIAGNOSIS_COMPLETED',
  'BUDGET_GENERATED',
  'SUPPLEMENTARY_BUDGET_GENERATED',
  'BUDGET_SENT',
  'BUDGET_APPROVED',
  'BUDGET_REJECTED',
  'EXECUTION_STARTED',
];

const FIVE_PRIOR_LITERALS = [
  'WORK_ORDER_CREATED',
  'SERVICE_ADDED_TO_WORK_ORDER',
  'PART_PLANNED_FOR_WORK_ORDER',
  'ITEM_REMOVED_FROM_WORK_ORDER',
  'MECHANIC_ASSIGNED',
];

describe('the eight event types', () => {
  it('are distinct from each other', () => {
    expect(new Set(EIGHT_LITERALS).size).toBe(EIGHT_LITERALS.length);
  });

  it('are distinct from the five feature 5 already exports', () => {
    const overlap = EIGHT_LITERALS.filter((literal) => FIVE_PRIOR_LITERALS.includes(literal));
    expect(overlap).toEqual([]);
  });
});

describe('DiagnosisStarted', () => {
  it('carries RECEIVED to IN_DIAGNOSIS, the work order id, the actor and the moment', () => {
    const event = new DiagnosisStarted(WORK_ORDER_ID, ACTOR_ID, NOW);

    expect(event.eventType).toBe('DIAGNOSIS_STARTED');
    expect(event.workOrderId).toBe(WORK_ORDER_ID);
    expect(event.actorUserId).toBe(ACTOR_ID);
    expect(event.occurredAt).toBe(NOW);
    expect(event.fromStatus).toBe(WorkOrderStatus.Received);
    expect(event.toStatus).toBe(WorkOrderStatus.InDiagnosis);
  });
});

describe('DiagnosisCompleted', () => {
  it('carries IN_DIAGNOSIS to AWAITING_APPROVAL', () => {
    const event = new DiagnosisCompleted(WORK_ORDER_ID, ACTOR_ID, NOW);

    expect(event.eventType).toBe('DIAGNOSIS_COMPLETED');
    expect(event.fromStatus).toBe(WorkOrderStatus.InDiagnosis);
    expect(event.toStatus).toBe(WorkOrderStatus.AwaitingApproval);
  });
});

describe('BudgetGenerated', () => {
  it('carries no status move, the work order id, the actor and the moment', () => {
    const event = new BudgetGenerated(WORK_ORDER_ID, ACTOR_ID, NOW);

    expect(event.eventType).toBe('BUDGET_GENERATED');
    expect(event.fromStatus).toBeNull();
    expect(event.toStatus).toBeNull();
    expect(event.workOrderId).toBe(WORK_ORDER_ID);
    expect(event.actorUserId).toBe(ACTOR_ID);
    expect(event.occurredAt).toBe(NOW);
  });
});

describe('SupplementaryBudgetGenerated', () => {
  it('carries no status move', () => {
    const event = new SupplementaryBudgetGenerated(WORK_ORDER_ID, ACTOR_ID, NOW);

    expect(event.eventType).toBe('SUPPLEMENTARY_BUDGET_GENERATED');
    expect(event.fromStatus).toBeNull();
    expect(event.toStatus).toBeNull();
  });
});

describe('BudgetSent', () => {
  it('carries no status move', () => {
    const event = new BudgetSent(WORK_ORDER_ID, ACTOR_ID, NOW);

    expect(event.eventType).toBe('BUDGET_SENT');
    expect(event.fromStatus).toBeNull();
    expect(event.toStatus).toBeNull();
  });
});

describe('BudgetApproved', () => {
  it('carries AWAITING_APPROVAL to IN_EXECUTION', () => {
    const event = new BudgetApproved(WORK_ORDER_ID, ACTOR_ID, NOW);

    expect(event.eventType).toBe('BUDGET_APPROVED');
    expect(event.fromStatus).toBe(WorkOrderStatus.AwaitingApproval);
    expect(event.toStatus).toBe(WorkOrderStatus.InExecution);
  });
});

describe('BudgetRejected', () => {
  it('carries AWAITING_APPROVAL to a caller-supplied destination', () => {
    const roundOne = new BudgetRejected(WORK_ORDER_ID, ACTOR_ID, WorkOrderStatus.InDiagnosis, NOW);
    const laterRound = new BudgetRejected(
      WORK_ORDER_ID,
      ACTOR_ID,
      WorkOrderStatus.InExecution,
      NOW,
    );

    expect(roundOne.eventType).toBe('BUDGET_REJECTED');
    expect(roundOne.fromStatus).toBe(WorkOrderStatus.AwaitingApproval);
    expect(roundOne.toStatus).toBe(WorkOrderStatus.InDiagnosis);
    expect(laterRound.toStatus).toBe(WorkOrderStatus.InExecution);
  });
});

describe('ExecutionStarted', () => {
  it('carries AWAITING_APPROVAL to IN_EXECUTION', () => {
    const event = new ExecutionStarted(WORK_ORDER_ID, ACTOR_ID, NOW);

    expect(event.eventType).toBe('EXECUTION_STARTED');
    expect(event.fromStatus).toBe(WorkOrderStatus.AwaitingApproval);
    expect(event.toStatus).toBe(WorkOrderStatus.InExecution);
  });
});
