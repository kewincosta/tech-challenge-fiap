import { afterEach, describe, expect, it, vi } from 'vitest';
import { PersonDocument } from '../../src/modules/identity/users/domain/value-objects/person-document';
import { LicensePlate } from '../../src/modules/vehicles/domain/value-objects/license-plate';
import { uniqueValidCpf } from '../support/factories/document.factory';
import { uniqueLicensePlate } from '../support/factories/plate.factory';

afterEach(() => {
  vi.restoreAllMocks();
});

/** What `action` returned, and the numbers `Math.random` gave while it ran. */
function recording<T>(action: () => T): { value: T; numbers: number[] } {
  const random = vi.spyOn(Math, 'random');
  try {
    const value = action();
    return { value, numbers: random.mock.results.map((result) => result.value as number) };
  } finally {
    random.mockRestore();
  }
}

/**
 * What `action` returned while `Math.random` gave these numbers first and its usual ones after
 * them, and how many times it was called. The call is synchronous, so nothing else asks for a
 * random number between the setup of the numbers and the end of the action.
 */
function replaying<T>(numbers: number[], action: () => T): { value: T; calls: number } {
  const random = vi.spyOn(Math, 'random');
  try {
    for (const number of numbers) {
      random.mockReturnValueOnce(number);
    }
    const value = action();
    return { value, calls: random.mock.calls.length };
  } finally {
    random.mockRestore();
  }
}

describe('Test values', () => {
  it('never hands out the same CPF or plate twice', () => {
    const factories: Array<[string, () => string, (value: string) => unknown]> = [
      ['CPF', uniqueValidCpf, (value) => PersonDocument.create(value)],
      ['plate', uniqueLicensePlate, (value) => LicensePlate.create(value)],
    ];

    for (const [name, factory, validate] of factories) {
      const first = recording(factory);
      // The second call draws the very numbers that gave the first value.
      const second = replaying(first.numbers, factory);

      expect(second.calls, `the second ${name} was drawn again`).toBeGreaterThan(
        first.numbers.length,
      );
      expect(second.value, `the second ${name} differs from the first`).not.toBe(first.value);
      expect(() => validate(second.value), `the second ${name} is valid`).not.toThrow();
    }
  });
});
