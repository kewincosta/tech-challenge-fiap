import { describe, expect, it } from 'vitest';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';
import { BudgetedItemNotRemovableError } from './budgeted-item-not-removable.error';
import { DiagnosisWithoutItemsError } from './diagnosis-without-items.error';
import { EmptyDraftBudgetError } from './empty-draft-budget.error';
import { WorkOrderBudgetLinkOutdatedError } from './work-order-budget-link-outdated.error';

describe('DiagnosisWithoutItemsError', () => {
  it('carries a distinct code and RuleViolation', () => {
    const error = new DiagnosisWithoutItemsError();

    expect(error.code).toBe('WORK_ORDER_DIAGNOSIS_WITHOUT_ITEMS');
    expect(error.kind).toBe(ErrorKind.RuleViolation);
  });

  it('names what the caller has to change', () => {
    expect(new DiagnosisWithoutItemsError().message).toMatch(/add at least one/i);
  });
});

describe('EmptyDraftBudgetError', () => {
  it('carries a distinct code and RuleViolation', () => {
    const error = new EmptyDraftBudgetError();

    expect(error.code).toBe('WORK_ORDER_EMPTY_DRAFT_BUDGET');
    expect(error.kind).toBe(ErrorKind.RuleViolation);
  });

  it('names what the caller has to change', () => {
    expect(new EmptyDraftBudgetError().message).toMatch(/add at least one/i);
  });
});

describe('BudgetedItemNotRemovableError', () => {
  it('carries a distinct code and RuleViolation', () => {
    const error = new BudgetedItemNotRemovableError();

    expect(error.code).toBe('WORK_ORDER_BUDGETED_ITEM_NOT_REMOVABLE');
    expect(error.kind).toBe(ErrorKind.RuleViolation);
  });

  it('names what the caller has to change', () => {
    expect(new BudgetedItemNotRemovableError().message).toMatch(/cannot be removed/i);
  });
});

describe('WorkOrderBudgetLinkOutdatedError', () => {
  it('carries its own code and RuleViolation', () => {
    const error = new WorkOrderBudgetLinkOutdatedError();

    expect(error.code).toBe('WORK_ORDER_BUDGET_LINK_OUTDATED');
    expect(error.kind).toBe(ErrorKind.RuleViolation);
  });

  it('says the budget was generated again after the link was sent', () => {
    expect(new WorkOrderBudgetLinkOutdatedError().message).toMatch(/generated again/i);
  });
});

describe('the three codes', () => {
  it('are distinct from each other', () => {
    const codes = [
      new DiagnosisWithoutItemsError().code,
      new EmptyDraftBudgetError().code,
      new BudgetedItemNotRemovableError().code,
    ];

    expect(new Set(codes).size).toBe(codes.length);
  });
});
