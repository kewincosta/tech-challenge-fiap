import { describe, expect, it } from 'vitest';
import { NpmAuditReport, dependencyDedupeKey, parseNpmAudit } from './npm-audit';

const report: NpmAuditReport = {
  auditReportVersion: 2,
  vulnerabilities: {
    lodash: {
      name: 'lodash',
      severity: 'high',
      isDirect: true,
      range: '<4.17.21',
      via: [
        {
          source: 1673,
          name: 'CVE-2021-23337',
          title: 'Command Injection in lodash',
          url: 'https://github.com/advisories/GHSA-35jh',
          severity: 'high',
          cwe: ['CWE-77'],
          cvss: { score: 7.2, vectorString: 'CVSS:3.1/AV:N' },
          range: '<4.17.21',
        },
      ],
      fixAvailable: { name: 'lodash', version: '4.17.21', isSemVerMajor: false },
    },
    'transitive-pkg': {
      name: 'transitive-pkg',
      severity: 'moderate',
      isDirect: false,
      range: '*',
      via: ['lodash'],
      fixAvailable: false,
    },
  },
};

describe('parseNpmAudit', () => {
  it('produces one finding per vulnerable package', () => {
    expect(parseNpmAudit(report)).toHaveLength(2);
  });

  it('carries the advisory title, CVE, CWE and fixed version', () => {
    const [lodash] = parseNpmAudit(report);

    expect(lodash.title).toBe('lodash: Command Injection in lodash');
    expect(lodash.severity).toBe('high');
    expect(lodash.cve).toEqual(['CVE-2021-23337']);
    expect(lodash.cwe).toEqual(['CWE-77']);
    expect(lodash.fixedIn).toBe('lodash@4.17.21');
    expect(lodash.packageName).toBe('lodash');
    expect(lodash.vulnerableVersions).toBe('<4.17.21');
  });

  it("maps npm's moderate onto medium", () => {
    const transitive = parseNpmAudit(report)[1];

    expect(transitive.severity).toBe('medium');
  });

  it('names the package a transitive advisory arrives through', () => {
    const transitive = parseNpmAudit(report)[1];

    expect(transitive.description).toContain('reached transitively through lodash');
  });

  it('classifies every advisory as A06, which is what a known vulnerable component is', () => {
    for (const finding of parseNpmAudit(report)) {
      expect(finding.owasp).toBe('A06');
      expect(finding.category).toBe('dependency');
      expect(finding.confidence).toBe('confirmed');
    }
  });

  it('says a fix is not published when none is, instead of suggesting an upgrade', () => {
    const transitive = parseNpmAudit(report)[1];

    expect(transitive.fixedIn).toBeUndefined();
    expect(transitive.recommendation).toContain('No fixed version is published');
  });

  it('flags a major upgrade as breaking, so the recommendation is not read as safe', () => {
    const [finding] = parseNpmAudit({
      vulnerabilities: {
        pkg: {
          name: 'pkg',
          severity: 'low',
          via: [],
          fixAvailable: { name: 'pkg', version: '5.0.0', isSemVerMajor: true },
        },
      },
    });

    expect(finding.fixedIn).toBe('pkg@5.0.0 (breaking upgrade)');
  });

  it.each([null, {}, { vulnerabilities: {} }])('returns nothing for %s', (input) => {
    expect(parseNpmAudit(input)).toEqual([]);
  });

  it('merges advisories rather than emitting one finding per advisory', () => {
    const [finding] = parseNpmAudit({
      vulnerabilities: {
        pkg: {
          name: 'pkg',
          severity: 'high',
          range: '<2',
          via: [
            { name: 'CVE-2020-1', title: 'First', severity: 'high', cwe: ['CWE-79'] },
            { name: 'CVE-2020-2', title: 'Second', severity: 'low', cwe: ['CWE-89'] },
          ],
          fixAvailable: false,
        },
      },
    });

    expect(finding.cve).toEqual(['CVE-2020-1', 'CVE-2020-2']);
    expect(finding.cwe).toEqual(['CWE-79', 'CWE-89']);
    expect(finding.description).toContain('2 advisories');
  });

  it('derives severity from the CVSS score when npm reports no usable word', () => {
    const [finding] = parseNpmAudit({
      vulnerabilities: {
        pkg: {
          name: 'pkg',
          severity: 'unknown',
          via: [{ name: 'CVE-2020-1', title: 'T', cvss: { score: 9.8 } }],
          fixAvailable: false,
        },
      },
    });

    expect(finding.severity).toBe('critical');
  });
});

describe('dependencyDedupeKey', () => {
  it('keys on the CVE set when there is one, so two tools agree', () => {
    expect(dependencyDedupeKey('lodash', ['CVE-2021-23337'])).toBe(
      'dependency:lodash:CVE-2021-23337',
    );
  });

  it('is insensitive to CVE order', () => {
    expect(dependencyDedupeKey('pkg', ['CVE-2', 'CVE-1'])).toBe(
      dependencyDedupeKey('pkg', ['CVE-1', 'CVE-2']),
    );
  });

  it('is insensitive to package name casing', () => {
    expect(dependencyDedupeKey('LoDash', [])).toBe(dependencyDedupeKey('lodash', []));
  });

  it('falls back to the package name when no CVE is known', () => {
    expect(dependencyDedupeKey('lodash', [])).toBe('dependency:lodash');
  });
});
