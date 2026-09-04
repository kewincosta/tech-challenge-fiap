import { describe, expect, it } from 'vitest';
import {
  Finding,
  compareSeverity,
  isMoreSevere,
  normaliseCwe,
  normaliseSeverity,
  severityFromCvss,
  uniqueSorted,
} from './finding';

function finding(overrides: Partial<Finding>): Finding {
  return {
    id: '',
    title: 'title',
    severity: 'low',
    tools: ['tool'],
    category: 'sast',
    owasp: null,
    cwe: [],
    cve: [],
    description: '',
    evidence: null,
    impact: null,
    recommendation: null,
    location: null,
    confidence: 'potential',
    dedupeKey: 'key',
    ...overrides,
  };
}

describe('normaliseSeverity', () => {
  it("maps npm audit's moderate onto medium", () => {
    expect(normaliseSeverity('moderate')).toBe('medium');
  });

  it('is case and whitespace insensitive', () => {
    expect(normaliseSeverity('  HIGH ')).toBe('high');
  });

  it.each(['info', 'information', 'none', 'unknown'])('maps %s to informational', (raw) => {
    expect(normaliseSeverity(raw)).toBe('informational');
  });

  it('falls back to informational for an unrecognised word rather than guessing upward', () => {
    expect(normaliseSeverity('catastrophic')).toBe('informational');
  });

  it.each([null, undefined, 42 as unknown as string])('falls back for %s', (raw) => {
    expect(normaliseSeverity(raw)).toBe('informational');
  });
});

describe('severityFromCvss', () => {
  it.each([
    [10, 'critical'],
    [9, 'critical'],
    [8.9, 'high'],
    [7, 'high'],
    [6.9, 'medium'],
    [4, 'medium'],
    [3.9, 'low'],
    [0.1, 'low'],
    [0, 'informational'],
  ])('maps %s to %s, using the bands the CVSS spec defines', (score, expected) => {
    expect(severityFromCvss(score)).toBe(expected);
  });

  it.each([null, undefined, Number.NaN, -1, 11])(
    'returns null for the out of range value %s',
    (score) => {
      expect(severityFromCvss(score)).toBeNull();
    },
  );
});

describe('normaliseCwe', () => {
  it.each(['CWE-79', 'cwe-79', 'CWE_79', 'cwe 79', '79', 79])('normalises %s to CWE-79', (raw) => {
    expect(normaliseCwe(raw)).toBe('CWE-79');
  });

  it.each([null, undefined, '', 'not-a-cwe', 'CWE-'])('returns null for %s', (raw) => {
    expect(normaliseCwe(raw)).toBeNull();
  });
});

describe('compareSeverity', () => {
  it('orders critical before informational', () => {
    const sorted = [
      finding({ severity: 'informational' }),
      finding({ severity: 'critical' }),
      finding({ severity: 'medium' }),
    ].sort(compareSeverity);

    expect(sorted.map((f) => f.severity)).toEqual(['critical', 'medium', 'informational']);
  });

  it('falls back to the title so the order is stable within a severity', () => {
    const sorted = [
      finding({ severity: 'high', title: 'b' }),
      finding({ severity: 'high', title: 'a' }),
    ].sort(compareSeverity);

    expect(sorted.map((f) => f.title)).toEqual(['a', 'b']);
  });
});

describe('isMoreSevere', () => {
  it('ranks critical above high and high above informational', () => {
    expect(isMoreSevere('critical', 'high')).toBe(true);
    expect(isMoreSevere('informational', 'high')).toBe(false);
    expect(isMoreSevere('high', 'high')).toBe(false);
  });
});

describe('uniqueSorted', () => {
  it('drops empties and duplicates, and sorts what is left', () => {
    expect(uniqueSorted(['b', 'a', 'b', null, undefined, ''])).toEqual(['a', 'b']);
  });
});
