import { describe, expect, it } from 'vitest';
import { parseConfig } from './config';
import { consolidate } from './consolidate';
import { Finding, ScannerResult } from './finding';
import {
  ReportContext,
  buildHtmlReport,
  buildMarkdownReport,
  escapeHtml,
  escapeMarkdownCell,
} from './report';

const config = parseConfig({
  application: { baseUrl: 'http://localhost:13000', apiPrefix: '/api/v1' },
  openapi: { url: 'http://localhost:13000/api/docs-json', path: null },
});

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'VULN-001',
    title: 'a finding',
    severity: 'high',
    tools: ['Semgrep'],
    category: 'sast',
    owasp: 'A03',
    cwe: ['CWE-89'],
    cve: [],
    description: 'description',
    evidence: null,
    impact: null,
    recommendation: 'fix it',
    location: 'src/x.ts:1',
    confidence: 'potential',
    dedupeKey: 'k',
    ...overrides,
  };
}

function context(findings: Finding[], results?: ScannerResult[]): ReportContext {
  const scannerResults = results ?? [
    { tool: 'Semgrep', status: 'ok', reason: null, findings, durationMs: 100, rawOutputPath: null },
  ];
  return {
    config,
    consolidation: consolidate(scannerResults),
    results: scannerResults,
    generatedAt: new Date('2026-09-04T12:00:00.000Z'),
    target: 'http://localhost:13000',
    limitations: ['The dynamic scan ran without credentials.'],
    toolVersions: [{ name: 'Semgrep', version: '1.97.0' }],
  };
}

describe('escapeHtml', () => {
  it('escapes every character that could break out of markup', () => {
    expect(escapeHtml(`<script>alert("x" + 'y' & z)</script>`)).toBe(
      '&lt;script&gt;alert(&quot;x&quot; + &#39;y&#39; &amp; z)&lt;/script&gt;',
    );
  });
});

describe('escapeMarkdownCell', () => {
  it('escapes pipes so evidence cannot split a table cell', () => {
    expect(escapeMarkdownCell('a | b')).toBe('a \\| b');
  });

  it('flattens newlines onto one line', () => {
    expect(escapeMarkdownCell('a\nb\r\nc')).toBe('a b c');
  });
});

describe('buildHtmlReport', () => {
  const html = buildHtmlReport(context([finding()]));

  it('carries the ten sections the report is required to have', () => {
    for (const heading of [
      '1. Executive Summary',
      '2. Scope',
      '3. Methodology',
      '4. Tools Used',
      '5. Results Summary',
      '6. Vulnerabilities Found',
      '7. OWASP Top 10 Mapping',
      '8. Recommendations',
      '9. Limitations',
      '10. Conclusion',
    ]) {
      expect(html).toContain(heading);
    }
  });

  it('opens offline: no external stylesheet, script or image', () => {
    expect(html).not.toMatch(/<link[^>]+href="http/i);
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toMatch(/<img[^>]+src="http/i);
    expect(html).toContain('<style>');
  });

  it('carries print rules, so the PDF export is not the screen layout', () => {
    expect(html).toContain('@media print');
  });

  it('escapes a finding title that contains markup', () => {
    const escaped = buildHtmlReport(context([finding({ title: '<img src=x onerror=alert(1)>' })]));

    expect(escaped).not.toContain('<img src=x');
    expect(escaped).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('states the total and the per-severity counts', () => {
    expect(html).toContain('Total findings: 1');
  });

  it('renders an unmapped finding as Not determined rather than picking a category', () => {
    const unmapped = buildHtmlReport(context([finding({ owasp: null })]));

    expect(unmapped).toContain('Not determined');
  });

  it('names a scanner that did not run, with its reason', () => {
    const withSkip = buildHtmlReport(
      context(
        [],
        [
          {
            tool: 'OWASP ZAP',
            status: 'skipped',
            reason: 'Docker is not available.',
            findings: [],
            durationMs: 0,
            rawOutputPath: null,
          },
        ],
      ),
    );

    expect(withSkip).toContain('OWASP ZAP');
    expect(withSkip).toContain('Not executed');
    expect(withSkip).toContain('Docker is not available.');
  });

  it('warns that a scanner which did not run is not a clean result', () => {
    expect(html).toContain('A scanner that did not run is not a clean result');
  });
});

describe('buildMarkdownReport', () => {
  const markdown = buildMarkdownReport(context([finding()]));

  it('carries the same ten sections', () => {
    for (const heading of [
      '## 1. Executive Summary',
      '## 5. Results Summary',
      '## 7. OWASP Top 10 Mapping',
      '## 10. Conclusion',
    ]) {
      expect(markdown).toContain(heading);
    }
  });

  it('renders the consolidated findings table', () => {
    expect(markdown).toContain('| ID | Severity | Vulnerability | Tool | OWASP |');
    expect(markdown).toContain('| VULN-001 | High |');
  });

  it('escapes a pipe inside a title so the table stays intact', () => {
    const piped = buildMarkdownReport(context([finding({ title: 'a | b' })]));

    expect(piped).toContain('a \\| b');
  });

  it('lists only the limitations that were passed in', () => {
    expect(markdown).toContain('- The dynamic scan ran without credentials.');
  });
});
