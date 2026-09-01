import { describe, expect, it } from 'vitest';
import { InvalidWorkOrderNumberError } from '../errors/invalid-work-order-number.error';
import { WorkOrderNumber } from './work-order-number';

describe('WorkOrderNumber', () => {
  it('should accept A1B090-2026 and expose it unchanged', () => {
    expect(WorkOrderNumber.create('A1B090-2026').value).toBe('A1B090-2026');
  });

  it('should normalise a lower-case number to upper case and trim surrounding whitespace', () => {
    expect(WorkOrderNumber.create('  a1b090-2026  ').value).toBe('A1B090-2026');
  });

  it('should reject a first block shorter or longer than six characters', () => {
    expect(() => WorkOrderNumber.create('A1B09-2026')).toThrow(InvalidWorkOrderNumberError);
    expect(() => WorkOrderNumber.create('A1B0900-2026')).toThrow(InvalidWorkOrderNumberError);
  });

  it('should reject a year block that is not exactly four digits', () => {
    expect(() => WorkOrderNumber.create('A1B090-26')).toThrow(InvalidWorkOrderNumberError);
    expect(() => WorkOrderNumber.create('A1B090-20266')).toThrow(InvalidWorkOrderNumberError);
  });

  it('should reject a character outside A-Z0-9 in the first block', () => {
    expect(() => WorkOrderNumber.create('A1B09!-2026')).toThrow(InvalidWorkOrderNumberError);
  });

  it('should reject an empty or whitespace-only value', () => {
    expect(() => WorkOrderNumber.create('')).toThrow(InvalidWorkOrderNumberError);
    expect(() => WorkOrderNumber.create('   ')).toThrow(InvalidWorkOrderNumberError);
  });
});
