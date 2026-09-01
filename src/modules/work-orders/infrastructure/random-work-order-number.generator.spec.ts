import { describe, expect, it } from 'vitest';
import { WorkOrderNumber } from '../domain/value-objects/work-order-number';
import { RandomWorkOrderNumberGenerator } from './random-work-order-number.generator';

describe('RandomWorkOrderNumberGenerator', () => {
  it('should produce a number WorkOrderNumber.create accepts, for a given year', () => {
    const generator = new RandomWorkOrderNumberGenerator();

    const number = generator.next(2026);

    expect(() => WorkOrderNumber.create(number)).not.toThrow();
    expect(number.endsWith('-2026')).toBe(true);
  });

  it('should use only characters from A-Z0-9 in the first block', () => {
    const generator = new RandomWorkOrderNumberGenerator();

    const number = generator.next(2026);
    const [block] = number.split('-');

    expect(block).toMatch(/^[A-Z0-9]{6}$/);
  });

  it('should differ between two consecutive draws', () => {
    const generator = new RandomWorkOrderNumberGenerator();

    const first = generator.next(2026);
    const second = generator.next(2026);

    expect(first).not.toBe(second);
  });
});
