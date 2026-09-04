import { describe, expect, it } from 'vitest';
import {
  DependencyCheckReport,
  packageNameFromPurl,
  packageVersionFromPurl,
  parseDependencyCheck,
} from './dependency-check';

const report: DependencyCheckReport = {
  dependencies: [
    {
      fileName: 'lodash:4.17.20',
      packages: [{ id: 'pkg:npm/lodash@4.17.20' }],
      vulnerabilities: [
        {
          name: 'CVE-2021-23337',
          source: 'NPM',
          severity: 'HIGH',
          cvssv3: { baseScore: 7.2, baseSeverity: 'HIGH' },
          cwes: ['CWE-77'],
          description: 'Command injection in lodash.',
          references: [{ url: 'https://nvd.example/CVE-2021-23337' }],
        },
      ],
    },
    {
      fileName: 'clean-pkg:1.0.0',
      packages: [{ id: 'pkg:npm/clean-pkg@1.0.0' }],
      vulnerabilities: [],
    },
  ],
};

describe('packageNameFromPurl', () => {
  it('reads an unscoped package name', () => {
    expect(packageNameFromPurl('pkg:npm/lodash@4.17.20')).toBe('lodash');
  });

  it('keeps the scope of a scoped package', () => {
    expect(packageNameFromPurl('pkg:npm/@nestjs/core@11.2.3')).toBe('@nestjs/core');
  });

  it.each([undefined, '', 'pkg:maven/foo@1.0'])('returns null for %s', (purl) => {
    expect(packageNameFromPurl(purl)).toBeNull();
  });
});

describe('packageVersionFromPurl', () => {
  it('reads the version off the coordinate', () => {
    expect(packageVersionFromPurl('pkg:npm/lodash@4.17.20')).toBe('4.17.20');
  });

  it('reads the version of a scoped package', () => {
    expect(packageVersionFromPurl('pkg:npm/@nestjs/core@11.2.3')).toBe('11.2.3');
  });

  it('returns null when there is no version', () => {
    expect(packageVersionFromPurl(undefined)).toBeNull();
  });
});

describe('parseDependencyCheck', () => {
  it('skips dependencies with no vulnerabilities', () => {
    expect(parseDependencyCheck(report)).toHaveLength(1);
  });

  it('carries the CVE, CWE, severity and package coordinate', () => {
    const [finding] = parseDependencyCheck(report);

    expect(finding.title).toBe('lodash: CVE-2021-23337');
    expect(finding.severity).toBe('high');
    expect(finding.cve).toEqual(['CVE-2021-23337']);
    expect(finding.cwe).toEqual(['CWE-77']);
    expect(finding.location).toBe('lodash@4.17.20');
    expect(finding.owasp).toBe('A06');
  });

  it('shares the deduplication key with npm audit, so the same CVE collapses into one row', () => {
    expect(parseDependencyCheck(report)[0].dedupeKey).toBe('dependency:lodash:CVE-2021-23337');
  });

  it('derives severity from the CVSS v3 score when no severity word is given', () => {
    const [finding] = parseDependencyCheck({
      dependencies: [
        {
          fileName: 'p',
          packages: [{ id: 'pkg:npm/p@1.0.0' }],
          vulnerabilities: [{ name: 'CVE-1', cvssv3: { baseScore: 9.8 } }],
        },
      ],
    });

    expect(finding.severity).toBe('critical');
  });

  it('falls back to the CVSS v2 score when v3 is absent', () => {
    const [finding] = parseDependencyCheck({
      dependencies: [
        {
          fileName: 'p',
          packages: [{ id: 'pkg:npm/p@1.0.0' }],
          vulnerabilities: [{ name: 'CVE-1', cvssv2: { score: 5.0 } }],
        },
      ],
    });

    expect(finding.severity).toBe('medium');
  });

  it('falls back to the file name when the package coordinate is missing', () => {
    const [finding] = parseDependencyCheck({
      dependencies: [{ fileName: 'some-archive.jar', vulnerabilities: [{ name: 'CVE-1' }] }],
    });

    expect(finding.packageName).toBe('some-archive.jar');
  });

  it('emits one finding per vulnerability of the same dependency', () => {
    const findings = parseDependencyCheck({
      dependencies: [
        {
          fileName: 'p',
          packages: [{ id: 'pkg:npm/p@1.0.0' }],
          vulnerabilities: [{ name: 'CVE-1' }, { name: 'CVE-2' }],
        },
      ],
    });

    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.dedupeKey)).toEqual(['dependency:p:CVE-1', 'dependency:p:CVE-2']);
  });

  it.each([null, {}, { dependencies: [] }])('returns nothing for %s', (input) => {
    expect(parseDependencyCheck(input as DependencyCheckReport | null)).toEqual([]);
  });
});
