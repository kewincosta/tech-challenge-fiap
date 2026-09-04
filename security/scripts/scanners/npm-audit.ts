import {
  Finding,
  normaliseCwe,
  normaliseSeverity,
  severityFromCvss,
  uniqueSorted,
} from '../finding';

/**
 * npm audit, version 2 of the JSON report (npm 7 and newer).
 *
 * The shape is a map of package name to an advisory group. `via` holds either a nested advisory
 * object, when the package is directly vulnerable, or a plain string naming the package that
 * drags the vulnerability in transitively.
 */

export const TOOL_NAME = 'npm audit';

interface NpmAuditAdvisory {
  source?: number;
  name?: string;
  title?: string;
  url?: string;
  severity?: string;
  cwe?: string[];
  cvss?: { score?: number; vectorString?: string | null };
  range?: string;
}

interface NpmAuditVulnerability {
  name?: string;
  severity?: string;
  isDirect?: boolean;
  via?: (NpmAuditAdvisory | string)[];
  range?: string;
  fixAvailable?: boolean | { name?: string; version?: string; isSemVerMajor?: boolean };
}

export interface NpmAuditReport {
  auditReportVersion?: number;
  vulnerabilities?: Record<string, NpmAuditVulnerability>;
}

function fixedIn(fixAvailable: NpmAuditVulnerability['fixAvailable']): string | undefined {
  if (typeof fixAvailable === 'object' && fixAvailable !== null && fixAvailable.version) {
    const major = fixAvailable.isSemVerMajor ? ' (breaking upgrade)' : '';
    return `${fixAvailable.name ?? ''}@${fixAvailable.version}${major}`.trim();
  }
  return undefined;
}

function recommendationFor(vulnerability: NpmAuditVulnerability, packageName: string): string {
  const fix = fixedIn(vulnerability.fixAvailable);
  if (fix) {
    return `Upgrade to ${fix}. Run \`npm audit fix\` after reviewing the change, or bump the dependency manually.`;
  }
  if (vulnerability.fixAvailable === true) {
    return `A fix is available. Run \`npm audit\` for the suggested upgrade path of ${packageName}.`;
  }
  return `No fixed version is published yet. Track the advisory, and consider whether ${packageName} can be replaced or its vulnerable code path avoided.`;
}

/**
 * One finding per vulnerable package, not per advisory: npm reports the same package once with
 * every advisory that reaches it, and splitting those into separate rows would inflate the count
 * without telling the reader anything new. Advisory titles, CWEs and CVEs are merged instead.
 */
export function parseNpmAudit(report: NpmAuditReport | null): Finding[] {
  const vulnerabilities = report?.vulnerabilities;
  if (!vulnerabilities) {
    return [];
  }

  const findings: Finding[] = [];
  for (const [packageName, vulnerability] of Object.entries(vulnerabilities)) {
    const advisories = (vulnerability.via ?? []).filter(
      (entry): entry is NpmAuditAdvisory => typeof entry === 'object' && entry !== null,
    );
    const transitiveVia = (vulnerability.via ?? []).filter(
      (entry): entry is string => typeof entry === 'string',
    );

    const cwes = uniqueSorted(advisories.flatMap((a) => (a.cwe ?? []).map(normaliseCwe)));
    const cves = uniqueSorted(
      advisories.map((a) => (a.name && /^CVE-/i.test(a.name) ? a.name.toUpperCase() : null)),
    );
    const bestCvss = advisories.reduce<number | null>((best, advisory) => {
      const score = advisory.cvss?.score;
      return typeof score === 'number' && (best === null || score > best) ? score : best;
    }, null);

    const severity =
      normaliseSeverity(vulnerability.severity) === 'informational' && bestCvss !== null
        ? (severityFromCvss(bestCvss) ?? 'informational')
        : normaliseSeverity(vulnerability.severity);

    const titles = advisories.map((a) => a.title).filter((t): t is string => Boolean(t));
    const title =
      titles.length > 0
        ? `${packageName}: ${titles[0]}`
        : `${packageName}: vulnerable dependency reported by npm audit`;

    const descriptionParts = [
      titles.length > 1
        ? `npm audit reports ${titles.length} advisories affecting ${packageName}: ${titles.join('; ')}.`
        : `npm audit reports an advisory affecting ${packageName}.`,
    ];
    if (transitiveVia.length > 0) {
      descriptionParts.push(
        `It is reached transitively through ${uniqueSorted(transitiveVia).join(', ')}.`,
      );
    }
    if (vulnerability.isDirect) {
      descriptionParts.push('It is a direct dependency of this project.');
    }

    const urls = uniqueSorted(advisories.map((a) => a.url));
    findings.push({
      id: '',
      title,
      severity,
      tools: [TOOL_NAME],
      category: 'dependency',
      // Every advisory here is by definition a known vulnerability in a component the project
      // depends on, which is what A06 covers. This is the one mapping that needs no CWE.
      owasp: 'A06',
      cwe: cwes,
      cve: cves,
      description: descriptionParts.join(' '),
      evidence: urls.length > 0 ? urls.join('\n') : null,
      impact: null,
      recommendation: recommendationFor(vulnerability, packageName),
      location: `${packageName}${vulnerability.range ? `@${vulnerability.range}` : ''}`,
      confidence: 'confirmed',
      packageName,
      vulnerableVersions: vulnerability.range ?? undefined,
      fixedIn: fixedIn(vulnerability.fixAvailable),
      dedupeKey: dependencyDedupeKey(packageName, cves),
    });
  }

  return findings;
}

/**
 * Shared with Dependency-Check so the same vulnerability found by both tools collapses into one
 * row. A CVE identifies the vulnerability precisely; without one, the package name is the best
 * available key.
 */
export function dependencyDedupeKey(packageName: string, cves: readonly string[]): string {
  const normalisedPackage = packageName.toLowerCase();
  return cves.length > 0
    ? `dependency:${normalisedPackage}:${[...cves].sort().join(',')}`
    : `dependency:${normalisedPackage}`;
}
