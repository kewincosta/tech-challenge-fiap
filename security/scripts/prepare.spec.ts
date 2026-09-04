import { describe, expect, it } from 'vitest';
import { cpfFromBase, scanDocument } from './prepare';

/** The same check the domain's PersonDocument performs, so the test proves real acceptance. */
function isValidCpf(digits: string): boolean {
  if (digits.length !== 11 || digits.split('').every((d) => d === digits[0])) {
    return false;
  }
  const numbers = digits.split('').map(Number);
  const digit = (slice: number[], weight: number): number => {
    const sum = slice.reduce((total, n, i) => total + n * (weight - i), 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  return (
    digit(numbers.slice(0, 9), 10) === numbers[9] && digit(numbers.slice(0, 10), 11) === numbers[10]
  );
}

describe('cpfFromBase', () => {
  it('appends the two check digits the domain verifies', () => {
    expect(cpfFromBase('111444777')).toBe('11144477735');
  });

  it.each(['287687331', '529982247', '390533447', '168995500'])(
    'produces a CPF the domain accepts for base %s',
    (base) => {
      expect(isValidCpf(cpfFromBase(base))).toBe(true);
    },
  );
});

describe('scanDocument', () => {
  it('produces a valid CPF for an email', () => {
    expect(isValidCpf(scanDocument('security-scanner@oficina.local'))).toBe(true);
  });

  it('is deterministic, so re-running the scan reuses the account', () => {
    expect(scanDocument('a@b.local')).toBe(scanDocument('a@b.local'));
  });

  it('gives different emails different documents, so two scan accounts do not collide', () => {
    expect(scanDocument('a@b.local')).not.toBe(scanDocument('c@d.local'));
  });

  it.each(['x@y.local', 'security-scanner@oficina.local', 'very.long.address+tag@example.test'])(
    'stays inside eleven digits for %s',
    (email) => {
      expect(scanDocument(email)).toHaveLength(11);
    },
  );
});

describe('escaping a target into a ZAP exclusion pattern', () => {
  /** Mirrors the helper in security-scan.ts; the dots in a host must not match any character. */
  const escapeForRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  it('escapes the dots of a host so the pattern cannot match a different one', () => {
    expect(escapeForRegex('http://api.example.com')).toBe('http://api\\.example\\.com');
  });

  it('leaves a plain path untouched', () => {
    expect(escapeForRegex('/api/v1')).toBe('/api/v1');
  });

  it('escapes the characters that would otherwise be regex operators', () => {
    expect(escapeForRegex('a+b(c)')).toBe('a\\+b\\(c\\)');
  });
});
