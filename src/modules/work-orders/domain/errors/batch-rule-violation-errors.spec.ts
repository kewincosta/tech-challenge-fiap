import { describe, expect, it } from 'vitest';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';
import { DuplicateBatchLineError } from './duplicate-batch-line.error';
import { PartNotWithdrawableError } from './part-not-withdrawable.error';
import { ReturnExceedsWithdrawnError } from './return-exceeds-withdrawn.error';
import { WithdrawalExceedsPlannedError } from './withdrawal-exceeds-planned.error';

describe('PartNotWithdrawableError', () => {
  it('carries a distinct code and RuleViolation', () => {
    const error = new PartNotWithdrawableError();

    expect(error.code).toBe('WORK_ORDER_PART_NOT_WITHDRAWABLE');
    expect(error.kind).toBe(ErrorKind.RuleViolation);
  });

  it('names both reasons it fires', () => {
    expect(new PartNotWithdrawableError().message).toMatch(/approved/i);
  });
});

describe('WithdrawalExceedsPlannedError', () => {
  it('carries a distinct code and RuleViolation', () => {
    const error = new WithdrawalExceedsPlannedError();

    expect(error.code).toBe('WORK_ORDER_WITHDRAWAL_EXCEEDS_PLANNED');
    expect(error.kind).toBe(ErrorKind.RuleViolation);
  });
});

describe('ReturnExceedsWithdrawnError', () => {
  it('carries a distinct code and RuleViolation', () => {
    const error = new ReturnExceedsWithdrawnError();

    expect(error.code).toBe('WORK_ORDER_RETURN_EXCEEDS_WITHDRAWN');
    expect(error.kind).toBe(ErrorKind.RuleViolation);
  });
});

describe('DuplicateBatchLineError', () => {
  it('carries a distinct code and RuleViolation', () => {
    const error = new DuplicateBatchLineError();

    expect(error.code).toBe('WORK_ORDER_DUPLICATE_BATCH_LINE');
    expect(error.kind).toBe(ErrorKind.RuleViolation);
  });
});

describe('the four codes', () => {
  it('are distinct from each other', () => {
    const codes = [
      new PartNotWithdrawableError().code,
      new WithdrawalExceedsPlannedError().code,
      new ReturnExceedsWithdrawnError().code,
      new DuplicateBatchLineError().code,
    ];

    expect(new Set(codes).size).toBe(codes.length);
  });
});
