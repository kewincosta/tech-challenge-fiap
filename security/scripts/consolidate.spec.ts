import { describe, expect, it } from 'vitest';
import {
  consolidate,
  countBySeverity,
  deduplicate,
  mergeFindings,
  owaspBreakdown,
  summaryStatement,
} from './consolidate';
import { Finding, ScannerResult, Severity } from './finding';

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: '',
    title: 'a finding',
    severity: 'medium',
    tools: ['tool'],
    category: 'sast',
    owasp: null,
    cwe: [],
    cve: [],
    description: 'description',
    evidence: null,
    impact: null,
    recommendation: null,
    location: null,
    confidence: 'potential',
    dedupeKey: 'key',
    ...overrides,
  };
}

function result(overrides: Partial<ScannerResult> = {}): ScannerResult {
  return {
    tool: 'tool',
    status: 'ok',
    reason: null,
    findings: [],
    durationMs: 10,
    rawOutputPath: null,
    ...overrides,
  };
}

describe('mergeFindings', () => {
  it('keeps the higher of the two severities', () => {
    const merged = mergeFindings(
      finding({ severity: 'low' }),
      finding({ severity: 'critical', tools: ['other'] }),
    );

    expect(merged.severity).toBe('critical');
  });

  it('does not lower a severity when the second report is milder', () => {
    const merged = mergeFindings(finding({ severity: 'critical' }), finding({ severity: 'low' }));

    expect(merged.severity).toBe('critical');
  });

  it('lists both tools, so the reader sees the finding was corroborated', () => {
    const merged = mergeFindings(
      finding({ tools: ['npm audit'] }),
      finding({ tools: ['OWASP Dependency-Check'] }),
    );

    expect(merged.tools).toEqual(['OWASP Dependency-Check', 'npm audit']);
  });

  it('unions the identifiers rather than losing one to deduplication', () => {
    const merged = mergeFindings(
      finding({ cve: ['CVE-1'], cwe: ['CWE-79'] }),
      finding({ cve: ['CVE-2'], cwe: ['CWE-89'] }),
    );

    expect(merged.cve).toEqual(['CVE-1', 'CVE-2']);
    expect(merged.cwe).toEqual(['CWE-79', 'CWE-89']);
  });

  it('takes an OWASP category from the second report when the first has none', () => {
    expect(mergeFindings(finding({ owasp: null }), finding({ owasp: 'A06' })).owasp).toBe('A06');
  });

  it('raises the classification to confirmed when either tool confirmed it', () => {
    const merged = mergeFindings(
      finding({ confidence: 'potential' }),
      finding({ confidence: 'confirmed' }),
    );

    expect(merged.confidence).toBe('confirmed');
  });

  it('fills a missing recommendation from the other report', () => {
    const merged = mergeFindings(
      finding({ recommendation: null }),
      finding({ recommendation: 'Upgrade' }),
    );

    expect(merged.recommendation).toBe('Upgrade');
  });
});

describe('deduplicate', () => {
  it('collapses findings that share a key', () => {
    const findings = deduplicate([
      finding({ dedupeKey: 'dependency:lodash:CVE-1', tools: ['npm audit'] }),
      finding({ dedupeKey: 'dependency:lodash:CVE-1', tools: ['OWASP Dependency-Check'] }),
      finding({ dedupeKey: 'sast:rule:file' }),
    ]);

    expect(findings).toHaveLength(2);
    expect(findings[0].tools).toHaveLength(2);
  });

  it('leaves distinct findings alone', () => {
    expect(deduplicate([finding({ dedupeKey: 'a' }), finding({ dedupeKey: 'b' })])).toHaveLength(2);
  });

  it('returns nothing for an empty list', () => {
    expect(deduplicate([])).toEqual([]);
  });
});

describe('countBySeverity', () => {
  it('counts each level, and zero for the levels with nothing', () => {
    const counts = countBySeverity([
      finding({ severity: 'critical' }),
      finding({ severity: 'high' }),
      finding({ severity: 'high' }),
    ]);

    expect(counts).toEqual({ critical: 1, high: 2, medium: 0, low: 0, informational: 0 });
  });
});

describe('owaspBreakdown', () => {
  it('lists all ten categories, including the empty ones', () => {
    const rows = owaspBreakdown([finding({ owasp: 'A03' })]);

    expect(rows).toHaveLength(10);
    expect(rows.find((row) => row.id === 'A03')?.count).toBe(1);
    expect(rows.find((row) => row.id === 'A01')?.count).toBe(0);
  });
});

describe('consolidate', () => {
  it('numbers the findings in severity order', () => {
    const consolidation = consolidate([
      result({
        findings: [
          finding({ severity: 'low', dedupeKey: 'a' }),
          finding({ severity: 'critical', dedupeKey: 'b' }),
        ],
      }),
    ]);

    expect(consolidation.findings.map((f) => [f.id, f.severity])).toEqual([
      ['VULN-001', 'critical'],
      ['VULN-002', 'low'],
    ]);
  });

  it('counts findings a second tool corroborated', () => {
    const consolidation = consolidate([
      result({ tool: 'a', findings: [finding({ dedupeKey: 'shared', tools: ['a'] })] }),
      result({ tool: 'b', findings: [finding({ dedupeKey: 'shared', tools: ['b'] })] }),
    ]);

    expect(consolidation.total).toBe(1);
    expect(consolidation.corroborated).toBe(1);
  });

  it('separates the scanners that ran from those that did not', () => {
    const consolidation = consolidate([
      result({ tool: 'a' }),
      result({ tool: 'b', status: 'skipped', reason: 'Docker missing' }),
      result({ tool: 'c', status: 'failed', reason: 'timeout' }),
    ]);

    expect(consolidation.executedScanners).toHaveLength(1);
    expect(consolidation.skippedScanners).toHaveLength(1);
    expect(consolidation.failedScanners).toHaveLength(1);
  });

  it('counts findings per analysis type', () => {
    const consolidation = consolidate([
      result({
        findings: [
          finding({ category: 'dependency', dedupeKey: '1' }),
          finding({ category: 'sast', dedupeKey: '2' }),
          finding({ category: 'dast', dedupeKey: '3' }),
        ],
      }),
    ]);

    expect(consolidation.byCategory).toEqual({ dependency: 1, sast: 1, dast: 1 });
  });

  it('counts the findings with no reliable OWASP mapping', () => {
    const consolidation = consolidate([
      result({
        findings: [
          finding({ owasp: null, dedupeKey: '1' }),
          finding({ owasp: 'A03', dedupeKey: '2' }),
        ],
      }),
    ]);

    expect(consolidation.notDetermined).toBe(1);
  });
});

describe('summaryStatement', () => {
  it('never calls a clean run proof of security', () => {
    const statement = summaryStatement(consolidate([result()]));

    expect(statement).toContain('not proof that the application is free of vulnerabilities');
  });

  it('says the assessment is partial when a scanner did not run', () => {
    const statement = summaryStatement(
      consolidate([
        result({ tool: 'a' }),
        result({ tool: 'b', status: 'skipped', reason: 'no docker' }),
      ]),
    );

    expect(statement).toContain('did not produce results');
    expect(statement).toContain('partial');
  });

  it('calls out critical and high findings as blocking', () => {
    const statement = summaryStatement(
      consolidate([result({ findings: [finding({ severity: 'critical', dedupeKey: '1' })] })]),
    );

    expect(statement).toContain('1 of them at critical or high severity');
  });

  it('says so plainly when nothing reached critical or high', () => {
    const statement = summaryStatement(
      consolidate([result({ findings: [finding({ severity: 'low', dedupeKey: '1' })] })]),
    );

    expect(statement).toContain('none of them at critical or high severity');
  });

  it.each<[Severity, string]>([
    ['critical', '1 of them at critical or high'],
    ['high', '1 of them at critical or high'],
  ])('treats %s as blocking', (severity, expected) => {
    const statement = summaryStatement(
      consolidate([result({ findings: [finding({ severity, dedupeKey: '1' })] })]),
    );

    expect(statement).toContain(expected);
  });
});
