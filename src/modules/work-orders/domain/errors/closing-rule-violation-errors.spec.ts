import { describe, expect, it } from 'vitest';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';
import { CancelInExecutionForbiddenError } from './cancel-in-execution-forbidden.error';
import { CompletionForbiddenError } from './completion-forbidden.error';
import { DiscountExceedsChargedTotalError } from './discount-exceeds-charged-total.error';

describe('DiscountExceedsChargedTotalError', () => {
  it('carries a distinct code and RuleViolation', () => {
    const error = new DiscountExceedsChargedTotalError();

    expect(error.code).toBe('WORK_ORDER_DISCOUNT_EXCEEDS_CHARGED_TOTAL');
    expect(error.kind).toBe(ErrorKind.RuleViolation);
  });

  it('names the discount as why it fired', () => {
    expect(new DiscountExceedsChargedTotalError().message).toMatch(/discount/i);
  });
});

describe('CompletionForbiddenError', () => {
  it('carries a distinct code and Forbidden', () => {
    const error = new CompletionForbiddenError();

    expect(error.code).toBe('WORK_ORDER_COMPLETION_FORBIDDEN');
    expect(error.kind).toBe(ErrorKind.Forbidden);
  });

  it('names who may complete the work order', () => {
    expect(new CompletionForbiddenError().message).toMatch(/assigned mechanic|work-orders:manage/i);
  });
});

describe('CancelInExecutionForbiddenError', () => {
  it('carries the exact code H36 names, and Forbidden', () => {
    const error = new CancelInExecutionForbiddenError();

    expect(error.code).toBe('WORK_ORDER_CANCEL_IN_EXECUTION_FORBIDDEN');
    expect(error.kind).toBe(ErrorKind.Forbidden);
  });

  it('names the loss and the permission that would allow it', () => {
    expect(new CancelInExecutionForbiddenError().message).toMatch(/loss/i);
    expect(new CancelInExecutionForbiddenError().message).toMatch(/work-orders:cancel-in-execution/);
  });
});
