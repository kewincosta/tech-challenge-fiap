import {
  Finding,
  ScannerResult,
  SEVERITIES,
  Severity,
  compareSeverity,
  isMoreSevere,
  uniqueSorted,
} from './finding';
import { OWASP_TOP_10 } from './owasp';

/**
 * Turns the per-scanner results into the single ordered list the report prints: deduplicated,
 * numbered, counted and grouped by OWASP category.
 */

export type SeverityCounts = Record<Severity, number>;

export interface OwaspRow {
  id: string;
  title: string;
  count: number;
}

export interface Consolidation {
  findings: Finding[];
  counts: SeverityCounts;
  total: number;
  /** Findings a second scanner independently confirmed. */
  corroborated: number;
  byCategory: { dependency: number; sast: number; dast: number };
  owaspRows: OwaspRow[];
  notDetermined: number;
  executedScanners: ScannerResult[];
  skippedScanners: ScannerResult[];
  failedScanners: ScannerResult[];
}

function emptyCounts(): SeverityCounts {
  return { critical: 0, high: 0, medium: 0, low: 0, informational: 0 };
}

/**
 * Merges two reports of the same vulnerability. The surviving finding keeps the higher severity
 * and the union of every identifier, because losing a CVE or a CWE to deduplication would make
 * the merged row less useful than either original.
 */
export function mergeFindings(first: Finding, second: Finding): Finding {
  return {
    ...first,
    severity: isMoreSevere(second.severity, first.severity) ? second.severity : first.severity,
    tools: uniqueSorted([...first.tools, ...second.tools]),
    cwe: uniqueSorted([...first.cwe, ...second.cwe]),
    cve: uniqueSorted([...first.cve, ...second.cve]),
    owasp: first.owasp ?? second.owasp,
    evidence: first.evidence ?? second.evidence,
    impact: first.impact ?? second.impact,
    recommendation: first.recommendation ?? second.recommendation,
    fixedIn: first.fixedIn ?? second.fixedIn,
    vulnerableVersions: first.vulnerableVersions ?? second.vulnerableVersions,
    // Two independent tools reaching the same conclusion is what raises a static match above a
    // single-tool candidate.
    confidence:
      first.confidence === 'confirmed' || second.confidence === 'confirmed'
        ? 'confirmed'
        : first.confidence,
  };
}

export function deduplicate(findings: readonly Finding[]): Finding[] {
  const byKey = new Map<string, Finding>();
  for (const finding of findings) {
    const existing = byKey.get(finding.dedupeKey);
    byKey.set(finding.dedupeKey, existing ? mergeFindings(existing, finding) : finding);
  }
  return [...byKey.values()];
}

export function countBySeverity(findings: readonly Finding[]): SeverityCounts {
  const counts = emptyCounts();
  for (const finding of findings) {
    counts[finding.severity] += 1;
  }
  return counts;
}

/** Every category is listed, including the ones with no findings: a zero is a result too. */
export function owaspBreakdown(findings: readonly Finding[]): OwaspRow[] {
  return OWASP_TOP_10.map((category) => ({
    id: category.id,
    title: category.title,
    count: findings.filter((finding) => finding.owasp === category.id).length,
  }));
}

export function consolidate(results: readonly ScannerResult[]): Consolidation {
  const deduplicated = deduplicate(results.flatMap((result) => result.findings));
  const findings = deduplicated
    .sort(compareSeverity)
    .map((finding, index) => ({ ...finding, id: `VULN-${String(index + 1).padStart(3, '0')}` }));

  return {
    findings,
    counts: countBySeverity(findings),
    total: findings.length,
    corroborated: findings.filter((finding) => finding.tools.length > 1).length,
    byCategory: {
      dependency: findings.filter((finding) => finding.category === 'dependency').length,
      sast: findings.filter((finding) => finding.category === 'sast').length,
      dast: findings.filter((finding) => finding.category === 'dast').length,
    },
    owaspRows: owaspBreakdown(findings),
    notDetermined: findings.filter((finding) => finding.owasp === null).length,
    executedScanners: results.filter((result) => result.status === 'ok'),
    skippedScanners: results.filter((result) => result.status === 'skipped'),
    failedScanners: results.filter((result) => result.status === 'failed'),
  };
}

/**
 * The executive summary sentence, written from the counts rather than from a judgement. A run
 * where scanners did not execute never says the project is clean: it says what was not looked at.
 */
export function summaryStatement(consolidation: Consolidation): string {
  const { counts, total } = consolidation;
  const missing = consolidation.skippedScanners.length + consolidation.failedScanners.length;
  const coverage =
    missing > 0
      ? ` ${missing} of ${consolidation.executedScanners.length + missing} scanners did not produce results, so this assessment is partial; see Limitations.`
      : '';

  if (total === 0) {
    return missing > 0
      ? `No findings were reported by the scanners that ran.${coverage}`
      : 'No findings were reported by any of the scanners that ran. This is evidence of the absence of what these tools detect, not proof that the application is free of vulnerabilities.';
  }

  const blocking = counts.critical + counts.high;
  const headline =
    blocking > 0
      ? `${total} findings were reported, ${blocking} of them at critical or high severity, which should be addressed before the application is exposed to untrusted traffic.`
      : `${total} findings were reported, none of them at critical or high severity.`;

  return `${headline}${coverage}`;
}

export function severityLabel(severity: Severity): string {
  return severity.charAt(0).toUpperCase() + severity.slice(1);
}

export const ORDERED_SEVERITIES = SEVERITIES;
