import { describe, expect, it } from 'vitest';
import { InvalidPlannedQuantityError } from '../errors/invalid-planned-quantity.error';
import { PlannedQuantity } from './planned-quantity';

describe('PlannedQuantity', () => {
  it('should accept a positive whole number', () => {
    expect(PlannedQuantity.create(3).units).toBe(3);
  });

  it('should reject zero', () => {
    expect(() => PlannedQuantity.create(0)).toThrow(InvalidPlannedQuantityError);
  });

  it('should reject a negative value', () => {
    expect(() => PlannedQuantity.create(-1)).toThrow(InvalidPlannedQuantityError);
  });

  it('should reject a fractional value', () => {
    expect(() => PlannedQuantity.create(1.5)).toThrow(InvalidPlannedQuantityError);
  });

  it('should accept the largest value the integer column stores', () => {
    expect(PlannedQuantity.create(2147483647).units).toBe(2147483647);
  });

  it('should reject one above the largest value the integer column stores', () => {
    expect(() => PlannedQuantity.create(2147483648)).toThrow(InvalidPlannedQuantityError);
  });
});
