import { describe, expect, it } from 'vitest';
import {
  Snapshot,
  SnapshotFinding,
  buildSummaryHtml,
  buildSummaryMarkdown,
  compare,
  findingKey,
  severityLabel,
} from './summary-report';

function finding(overrides: Partial<SnapshotFinding> = {}): SnapshotFinding {
  return {
    id: 'VULN-001',
    title: 'um achado',
    severity: 'high',
    tools: ['npm audit'],
    owasp: 'A06',
    cwe: [],
    cve: [],
    category: 'dependency',
    confidence: 'confirmed',
    location: null,
    ...overrides,
  };
}

function snapshot(phase: 'before' | 'after', findings: SnapshotFinding[]): Snapshot {
  const counts: Record<string, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    informational: 0,
  };
  for (const item of findings) {
    counts[item.severity] += 1;
  }
  return {
    phase,
    generatedAt: '2026-09-04T22:00:00.000Z',
    target: 'http://localhost:13000',
    counts,
    total: findings.length,
    scanners: [{ tool: 'npm audit', status: 'ok', findings: findings.length, reason: null }],
    findings,
  };
}

describe('findingKey', () => {
  it('keys a dependency finding on the package and its CVEs', () => {
    expect(findingKey(finding({ packageName: 'qs', cve: ['CVE-1'] }))).toBe('qs:CVE-1');
  });

  it('is insensitive to CVE order, so the same vulnerability matches across runs', () => {
    const a = findingKey(finding({ packageName: 'p', cve: ['CVE-2', 'CVE-1'] }));
    const b = findingKey(finding({ packageName: 'p', cve: ['CVE-1', 'CVE-2'] }));

    expect(a).toBe(b);
  });

  it('falls back to category and package when there is no CVE', () => {
    expect(findingKey(finding({ packageName: '@faker-js/faker' }))).toBe(
      'dependency:@faker-js/faker',
    );
  });

  it('uses the title for a finding with no package, such as a ZAP alert', () => {
    expect(findingKey(finding({ category: 'dast', title: 'Non-Storable Content' }))).toBe(
      'dast:Non-Storable Content',
    );
  });

  it('does not key on the id, which shifts when a finding is removed', () => {
    const first = findingKey(finding({ id: 'VULN-001', packageName: 'p' }));
    const second = findingKey(finding({ id: 'VULN-009', packageName: 'p' }));

    expect(first).toBe(second);
  });
});

describe('compare', () => {
  const before = snapshot('before', [
    finding({ packageName: 'qs', cve: ['CVE-1'] }),
    finding({ packageName: 'faker' }),
    finding({ category: 'dast', title: 'alert', severity: 'informational' }),
  ]);

  it('lists what disappeared as resolved', () => {
    const after = snapshot('after', [finding({ packageName: 'faker' })]);

    expect(compare(before, after).resolved.map(findingKey)).toEqual(['qs:CVE-1', 'dast:alert']);
  });

  it('lists what survived as remaining', () => {
    const after = snapshot('after', [finding({ packageName: 'faker' })]);

    expect(compare(before, after).remaining.map(findingKey)).toEqual(['dependency:faker']);
  });

  it('lists what only the second run found as introduced', () => {
    const after = snapshot('after', [finding({ packageName: 'novo' })]);

    expect(compare(before, after).introduced.map(findingKey)).toEqual(['dependency:novo']);
  });

  it('reports nothing resolved when the two runs agree', () => {
    expect(compare(before, before).resolved).toEqual([]);
    expect(compare(before, before).remaining).toHaveLength(3);
  });
});

describe('buildSummaryHtml', () => {
  const before = snapshot('before', [finding({ packageName: 'qs', cve: ['CVE-1'] })]);
  const after = snapshot('after', []);
  const html = buildSummaryHtml(before, after, compare(before, after));

  it('shows both totals', () => {
    expect(html).toContain('>1</div>');
    expect(html).toContain('>0</div>');
  });

  it('opens offline, with no external stylesheet or script', () => {
    expect(html).not.toMatch(/<link[^>]+href="http/i);
    expect(html).not.toMatch(/<script/i);
    expect(html).toContain('<style>');
  });

  it('carries print rules for the PDF export', () => {
    expect(html).toContain('@media print');
  });

  it('escapes a title that contains markup', () => {
    const b = snapshot('before', [finding({ title: '<img src=x onerror=alert(1)>' })]);
    const escaped = buildSummaryHtml(b, snapshot('after', []), compare(b, snapshot('after', [])));

    expect(escaped).not.toContain('<img src=x');
  });

  it('prints the written resolution when there is one', () => {
    const b = snapshot('before', [
      finding({ packageName: 'qs', resolution: 'Upgraded to 6.16.0.' }),
    ]);
    const rendered = buildSummaryHtml(b, snapshot('after', []), compare(b, snapshot('after', [])));

    expect(rendered).toContain('Upgraded to 6.16.0.');
  });
});

describe('buildSummaryMarkdown', () => {
  const before = snapshot('before', [finding({ packageName: 'qs', cve: ['CVE-1'] })]);
  const after = snapshot('after', []);
  const markdown = buildSummaryMarkdown(before, after, compare(before, after));

  it('renders the severity comparison table', () => {
    expect(markdown).toContain('| Severity | Before | After | Change |');
    expect(markdown).toContain('| **Total** | **1** | **0** | **-1** |');
  });

  it('says plainly when nothing changed', () => {
    const same = buildSummaryMarkdown(before, before, compare(before, before));

    expect(same).toContain('no change');
  });
});

describe('severityLabel', () => {
  it('capitalises the level', () => {
    expect(severityLabel('critical')).toBe('Critical');
  });
});
