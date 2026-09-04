import { describe, expect, it } from 'vitest';
import { ZapReport, parseZap, stripHtml } from './zap';

const report: ZapReport = {
  site: [
    {
      '@name': 'http://localhost:13000',
      alerts: [
        {
          pluginid: '10038',
          alertRef: '10038-1',
          name: 'Content Security Policy (CSP) Header Not Set',
          riskcode: '2',
          confidence: '3',
          desc: '<p>CSP is an added layer of security.</p>',
          solution: '<p>Ensure the web server sets the Content-Security-Policy header.</p>',
          cweid: '693',
          count: '2',
          instances: [
            { uri: 'http://localhost:13000/api/v1', method: 'GET', param: '', evidence: '' },
            { uri: 'http://localhost:13000/api/docs', method: 'GET', param: 'x', evidence: 'y' },
          ],
        },
        {
          pluginid: '10096',
          name: 'Timestamp Disclosure',
          riskcode: '0',
          confidence: '1',
          desc: '<p>A timestamp was disclosed.</p>',
          cweid: '200',
          instances: [{ uri: 'http://localhost:13000/api/v1/x', method: 'POST' }],
        },
      ],
    },
  ],
};

describe('stripHtml', () => {
  it('removes tags and decodes the entities ZAP emits', () => {
    expect(stripHtml('<p>a &amp; b &lt;c&gt;</p>')).toBe('a & b <c>');
  });

  it('turns block ends into line breaks', () => {
    expect(stripHtml('<p>one</p><p>two</p>')).toBe('one\ntwo');
  });

  it('returns an empty string for nothing', () => {
    expect(stripHtml(undefined)).toBe('');
  });
});

describe('parseZap', () => {
  it('produces one finding per alert, not per instance', () => {
    expect(parseZap(report)).toHaveLength(2);
  });

  it.each([
    ['3', 'high'],
    ['2', 'medium'],
    ['1', 'low'],
    ['0', 'informational'],
  ])("maps ZAP's riskcode %s onto %s", (riskcode, expected) => {
    const [finding] = parseZap({ site: [{ '@name': 's', alerts: [{ name: 'a', riskcode }] }] });

    expect(finding.severity).toBe(expected);
  });

  it('maps the CWE ZAP reports onto an OWASP category', () => {
    expect(parseZap(report)[0].cwe).toEqual(['CWE-693']);
    expect(parseZap(report)[1].owasp).toBe('A01');
  });

  it('leaves the category unmapped when the CWE has no documented mapping', () => {
    expect(parseZap(report)[0].owasp).toBeNull();
  });

  it('strips the HTML out of the description and the solution', () => {
    const [finding] = parseZap(report);

    expect(finding.description).toBe('CSP is an added layer of security.');
    expect(finding.recommendation).toBe(
      'Ensure the web server sets the Content-Security-Policy header.',
    );
  });

  it('lists the affected requests as evidence', () => {
    expect(parseZap(report)[0].evidence).toBe(
      'GET http://localhost:13000/api/v1\nGET http://localhost:13000/api/docs (param: x, evidence: y)',
    );
  });

  it('caps the evidence list and says how many were left out', () => {
    const instances = Array.from({ length: 8 }, (_, i) => ({
      uri: `http://x/${i}`,
      method: 'GET',
    }));
    const [finding] = parseZap({
      site: [{ '@name': 's', alerts: [{ name: 'a', riskcode: '1', instances }] }],
    });

    expect(finding.evidence).toContain('... and 3 more instances');
  });

  it("treats ZAP's highest confidence as confirmed", () => {
    const [finding] = parseZap({
      site: [{ '@name': 's', alerts: [{ name: 'a', riskcode: '2', confidence: '4' }] }],
    });

    expect(finding.confidence).toBe('confirmed');
  });

  it("reports ZAP's own false positive confidence as informational rather than discarding it", () => {
    const [finding] = parseZap({
      site: [{ '@name': 's', alerts: [{ name: 'a', riskcode: '2', confidence: '0' }] }],
    });

    expect(finding.confidence).toBe('informational');
  });

  it('keeps the first instance as the endpoint and method', () => {
    const [finding] = parseZap(report);

    expect(finding.endpoint).toBe('http://localhost:13000/api/v1');
    expect(finding.httpMethod).toBe('GET');
  });

  it('keys deduplication on the alert reference and the site', () => {
    expect(parseZap(report)[0].dedupeKey).toBe('dast:10038-1:http://localhost:13000');
  });

  it('keeps two distinct alerts of the same plugin apart, which pluginid alone would merge', () => {
    const findings = parseZap({
      site: [
        {
          '@name': 's',
          alerts: [
            { pluginid: '10049', alertRef: '10049-1', name: 'Non-Storable Content', riskcode: '0' },
            {
              pluginid: '10049',
              alertRef: '10049-3',
              name: 'Storable and Cacheable Content',
              riskcode: '0',
            },
          ],
        },
      ],
    });

    expect(new Set(findings.map((f) => f.dedupeKey)).size).toBe(2);
  });

  it('falls back to the plugin id when ZAP reports no alert reference', () => {
    const [finding] = parseZap({
      site: [{ '@name': 's', alerts: [{ pluginid: '10038', name: 'a', riskcode: '1' }] }],
    });

    expect(finding.dedupeKey).toBe('dast:10038:s');
  });

  it.each([null, {}, { site: [] }])('returns nothing for %s', (input) => {
    expect(parseZap(input as ZapReport | null)).toEqual([]);
  });
});
