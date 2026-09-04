import { describe, expect, it } from 'vitest';
import { OWASP_TOP_10, owaspFromCwes, owaspFromMetadata, owaspTitle } from './owasp';

describe('OWASP_TOP_10', () => {
  it('carries the ten 2021 categories, in order', () => {
    expect(OWASP_TOP_10).toHaveLength(10);
    expect(OWASP_TOP_10.map((c) => c.id)).toEqual([
      'A01',
      'A02',
      'A03',
      'A04',
      'A05',
      'A06',
      'A07',
      'A08',
      'A09',
      'A10',
    ]);
  });
});

describe('owaspFromCwes', () => {
  it.each([
    ['CWE-89', 'A03'],
    ['CWE-79', 'A03'],
    ['CWE-22', 'A01'],
    ['CWE-327', 'A02'],
    ['CWE-798', 'A07'],
    ['CWE-502', 'A08'],
    ['CWE-532', 'A09'],
    ['CWE-918', 'A10'],
  ])('maps %s to %s', (cwe, expected) => {
    expect(owaspFromCwes([cwe])).toBe(expected);
  });

  it('returns null for a CWE with no documented category, rather than a nearest guess', () => {
    expect(owaspFromCwes(['CWE-999999'])).toBeNull();
  });

  it('returns null for an empty list', () => {
    expect(owaspFromCwes([])).toBeNull();
  });

  it('takes the first CWE that has a mapping, skipping the ones that do not', () => {
    expect(owaspFromCwes(['CWE-999999', 'CWE-89'])).toBe('A03');
  });
});

describe('owaspFromMetadata', () => {
  it('reads the 2021 identifier Semgrep publishes', () => {
    expect(owaspFromMetadata(['A03:2021 - Injection'])).toBe('A03');
  });

  it('pads a single digit identifier', () => {
    expect(owaspFromMetadata(['A3:2021 - Injection'])).toBe('A03');
  });

  it('ignores the 2017 list, which is a different taxonomy', () => {
    expect(owaspFromMetadata(['A3:2017 - Sensitive Data Exposure'])).toBeNull();
  });

  it('ignores an identifier outside the ten categories', () => {
    expect(owaspFromMetadata(['A11:2021 - Not A Category'])).toBeNull();
  });

  it('returns null for free text with no identifier', () => {
    expect(owaspFromMetadata(['injection'])).toBeNull();
  });

  it('scans every entry, not only the first', () => {
    expect(owaspFromMetadata(['nonsense', 'A05:2021 - Security Misconfiguration'])).toBe('A05');
  });
});

describe('owaspTitle', () => {
  it('renders the identifier with its title', () => {
    expect(owaspTitle('A06')).toBe('A06 - Vulnerable and Outdated Components');
  });

  it.each([null, 'A99'])('renders %s as Not determined', (id) => {
    expect(owaspTitle(id)).toBe('Not determined');
  });
});
