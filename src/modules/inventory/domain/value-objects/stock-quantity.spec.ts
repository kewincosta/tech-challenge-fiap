import { describe, expect, it } from 'vitest';
import { InsufficientStockError } from '../errors/insufficient-stock.error';
import { InvalidStockQuantityError } from '../errors/invalid-stock-quantity.error';
import { StockQuantity } from './stock-quantity';

describe('StockQuantity', () => {
  it('should accept zero and any positive whole number of units', () => {
    expect(StockQuantity.of(0).units).toBe(0);
    expect(StockQuantity.of(42).units).toBe(42);
  });

  it('should reject a negative value', () => {
    expect(() => StockQuantity.of(-1)).toThrow(InvalidStockQuantityError);
  });

  it('should reject a fractional value', () => {
    expect(() => StockQuantity.of(1.5)).toThrow(InvalidStockQuantityError);
  });

  it('should return a new quantity with the units added on plus', () => {
    const result = StockQuantity.of(10).plus(5);

    expect(result.units).toBe(15);
  });

  it('should return a new quantity with the units subtracted on minus', () => {
    const result = StockQuantity.of(10).minus(4);

    expect(result.units).toBe(6);
  });

  it('should throw InsufficientStockError when minus would go below zero', () => {
    expect(() => StockQuantity.of(5).minus(6)).toThrow(InsufficientStockError);
  });

  it('should allow minus down to exactly zero', () => {
    const result = StockQuantity.of(5).minus(5);

    expect(result.units).toBe(0);
  });
});
