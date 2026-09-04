import {
  Finding,
  normaliseCwe,
  normaliseSeverity,
  severityFromCvss,
  uniqueSorted,
} from '../finding';
import { dependencyDedupeKey } from './npm-audit';

/**
 * OWASP Dependency-Check's JSON report.
 *
 * It reports per dependency file, and each dependency carries a package URL such as
 * `pkg:npm/lodash@4.17.20`. That coordinate is what lets a finding here be recognised as the same
 * vulnerability npm audit already reported.
 */

export const TOOL_NAME = 'OWASP Dependency-Check';

interface DependencyCheckVulnerability {
  name?: string;
  source?: string;
  severity?: string;
  cvssv3?: { baseScore?: number; baseSeverity?: string };
  cvssv2?: { score?: number; severity?: string };
  cwes?: string[];
  description?: string;
  notes?: string;
  references?: { url?: string; name?: string; source?: string }[];
}

interface DependencyCheckDependency {
  fileName?: string;
  filePath?: string;
  packages?: { id?: string; confidence?: string }[];
  vulnerabilities?: DependencyCheckVulnerability[];
}

export interface DependencyCheckReport {
  dependencies?: DependencyCheckDependency[];
}

/** `pkg:npm/@scope/name@1.2.3` becomes `@scope/name`; anything unparseable yields null. */
export function packageNameFromPurl(purl: string | undefined): string | null {
  if (!purl) {
    return null;
  }
  const match = /^pkg:npm\/(.+)$/.exec(purl.trim());
  if (!match) {
    return null;
  }
  const withoutVersion = match[1].split('@').slice(0, match[1].startsWith('@') ? 2 : 1);
  const name = withoutVersion.join('@');
  return name.length > 0 ? decodeURIComponent(name) : null;
}

export function packageVersionFromPurl(purl: string | undefined): string | null {
  if (!purl) {
    return null;
  }
  const match = /@([^@/]+)$/.exec(purl.trim());
  return match ? match[1] : null;
}

function severityOf(
  vulnerability: DependencyCheckVulnerability,
): ReturnType<typeof normaliseSeverity> {
  const word =
    vulnerability.severity ?? vulnerability.cvssv3?.baseSeverity ?? vulnerability.cvssv2?.severity;
  const fromWord = normaliseSeverity(word);
  if (fromWord !== 'informational') {
    return fromWord;
  }
  const fromScore =
    severityFromCvss(vulnerability.cvssv3?.baseScore) ??
    severityFromCvss(vulnerability.cvssv2?.score);
  return fromScore ?? 'informational';
}

function firstReference(vulnerability: DependencyCheckVulnerability): string | null {
  const urls = uniqueSorted((vulnerability.references ?? []).map((reference) => reference.url));
  return urls.length > 0 ? urls.slice(0, 5).join('\n') : null;
}

export function parseDependencyCheck(report: DependencyCheckReport | null): Finding[] {
  const dependencies = report?.dependencies;
  if (!dependencies) {
    return [];
  }

  const findings: Finding[] = [];
  for (const dependency of dependencies) {
    const vulnerabilities = dependency.vulnerabilities ?? [];
    if (vulnerabilities.length === 0) {
      continue;
    }
    const purl = dependency.packages?.[0]?.id;
    const packageName = packageNameFromPurl(purl) ?? dependency.fileName ?? 'unknown component';
    const version = packageVersionFromPurl(purl);

    for (const vulnerability of vulnerabilities) {
      const identifier = vulnerability.name?.trim();
      const cves = identifier && /^CVE-/i.test(identifier) ? [identifier.toUpperCase()] : [];
      const cwe = uniqueSorted(
        (vulnerability.cwes ?? []).map((entry) => {
          const match = /CWE-\d+/i.exec(entry);
          return normaliseCwe(match ? match[0] : entry);
        }),
      );

      findings.push({
        id: '',
        title: `${packageName}: ${identifier ?? 'vulnerable component'}`,
        severity: severityOf(vulnerability),
        tools: [TOOL_NAME],
        category: 'dependency',
        // Same reasoning as npm audit: a known vulnerability in a bundled component is A06 by
        // definition, whatever the underlying weakness happens to be.
        owasp: 'A06',
        cwe,
        cve: cves,
        description:
          vulnerability.description?.trim() ??
          `Dependency-Check matched ${packageName} against ${identifier ?? 'a known advisory'}.`,
        evidence: firstReference(vulnerability),
        impact: null,
        recommendation: `Check the advisory for a fixed release of ${packageName} and upgrade, or document why the vulnerable code path is not reachable.`,
        location: version ? `${packageName}@${version}` : packageName,
        confidence: 'confirmed',
        packageName,
        vulnerableVersions: version ?? undefined,
        dedupeKey: dependencyDedupeKey(packageName, cves),
      });
    }
  }

  return findings;
}
