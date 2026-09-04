import { describe, expect, it } from 'vitest';
import { SemgrepReport, parseSemgrep, semgrepErrors } from './semgrep';

const report: SemgrepReport = {
  results: [
    {
      check_id: 'javascript.express.security.audit.express-jwt-hardcoded-secret',
      path: 'src/config/auth.config.ts',
      start: { line: 12, col: 3 },
      end: { line: 12 },
      extra: {
        message: 'Hardcoded JWT secret detected.',
        severity: 'ERROR',
        lines: "  secret: 'hunter2',",
        metadata: {
          cwe: ['CWE-798: Use of Hard-coded Credentials'],
          owasp: ['A07:2021 - Identification and Authentication Failures'],
          references: ['https://example.test/rule'],
        },
      },
    },
    {
      check_id: 'rule.without.metadata',
      path: 'src/main.ts',
      start: { line: 4 },
      extra: { message: 'Something to review.', severity: 'INFO', metadata: {} },
    },
  ],
  errors: [{ message: 'Rule pack partially failed', level: 'warn' }],
};

describe('parseSemgrep', () => {
  it('produces one finding per match', () => {
    expect(parseSemgrep(report)).toHaveLength(2);
  });

  it('shortens the rule id to its last segment for the title', () => {
    expect(parseSemgrep(report)[0].title).toBe('express-jwt-hardcoded-secret');
  });

  it.each([
    ['ERROR', 'high'],
    ['WARNING', 'medium'],
    ['INFO', 'low'],
  ])("maps Semgrep's %s onto %s", (raw, expected) => {
    const [finding] = parseSemgrep({ results: [{ check_id: 'r', extra: { severity: raw } }] });

    expect(finding.severity).toBe(expected);
  });

  it("prefers the rule's own OWASP metadata over the CWE table", () => {
    expect(parseSemgrep(report)[0].owasp).toBe('A07');
  });

  it('falls back to the CWE table when the rule publishes no OWASP category', () => {
    const [finding] = parseSemgrep({
      results: [{ check_id: 'r', extra: { severity: 'ERROR', metadata: { cwe: ['CWE-89'] } } }],
    });

    expect(finding.owasp).toBe('A03');
  });

  it('leaves the category unmapped when the rule publishes neither', () => {
    expect(parseSemgrep(report)[1].owasp).toBeNull();
  });

  it('extracts the CWE number out of the descriptive string Semgrep uses', () => {
    expect(parseSemgrep(report)[0].cwe).toEqual(['CWE-798']);
  });

  it('records the file and line as the location', () => {
    expect(parseSemgrep(report)[0].location).toBe('src/config/auth.config.ts:12');
  });

  it('keeps the matched source line as evidence, trimmed of its surrounding whitespace', () => {
    expect(parseSemgrep(report)[0].evidence).toBe("secret: 'hunter2',");
  });

  it('records no evidence when the match carries no source line', () => {
    const [finding] = parseSemgrep({ results: [{ check_id: 'r', extra: { severity: 'INFO' } }] });

    expect(finding.evidence).toBeNull();
  });

  it('truncates evidence so a minified file cannot flood the report', () => {
    const [finding] = parseSemgrep({
      results: [{ check_id: 'r', extra: { severity: 'INFO', lines: 'x'.repeat(2000) } }],
    });

    expect(finding.evidence).toHaveLength(603);
    expect(finding.evidence?.endsWith('...')).toBe(true);
  });

  it('classifies every match as potential, since a static match is a candidate until reviewed', () => {
    for (const finding of parseSemgrep(report)) {
      expect(finding.confidence).toBe('potential');
      expect(finding.category).toBe('sast');
    }
  });

  it('keys deduplication on the rule and the location', () => {
    expect(parseSemgrep(report)[0].dedupeKey).toBe(
      'sast:javascript.express.security.audit.express-jwt-hardcoded-secret:src/config/auth.config.ts:12',
    );
  });

  it.each([null, {}, { results: [] }])('returns nothing for %s', (input) => {
    expect(parseSemgrep(input as SemgrepReport | null)).toEqual([]);
  });
});

describe('semgrepErrors', () => {
  it('surfaces the errors Semgrep reports about itself', () => {
    expect(semgrepErrors(report)).toEqual(['Rule pack partially failed']);
  });

  it.each([null, {}, { errors: [] }])('returns nothing for %s', (input) => {
    expect(semgrepErrors(input as SemgrepReport | null)).toEqual([]);
  });
});
