/**
 * The one shape every scanner is normalised into. Nothing downstream - deduplication, the
 * summary, the OWASP table, the report - knows which tool produced a finding beyond the `tools`
 * field, which is what lets two scanners agree on the same vulnerability without printing it
 * twice.
 */

export const SEVERITIES = ['critical', 'high', 'medium', 'low', 'informational'] as const;

export type Severity = (typeof SEVERITIES)[number];

/**
 * How much the finding has actually been verified. Nothing is marked as a false positive by this
 * tool: that claim needs a human review the scanners cannot perform (requirement 18).
 */
export type Confidence = 'confirmed' | 'potential' | 'informational';

export type FindingCategory = 'dependency' | 'sast' | 'dast';

export interface Finding {
  /** Assigned during consolidation, never by a scanner. */
  id: string;
  title: string;
  severity: Severity;
  /** More than one once two scanners are found to report the same vulnerability. */
  tools: string[];
  category: FindingCategory;
  /** An OWASP Top 10 2021 identifier such as `A03`, or null when no reliable mapping exists. */
  owasp: string | null;
  cwe: string[];
  cve: string[];
  description: string;
  evidence: string | null;
  impact: string | null;
  recommendation: string | null;
  /** A file and line, a package coordinate, or a URL, depending on the category. */
  location: string | null;
  confidence: Confidence;
  packageName?: string;
  vulnerableVersions?: string;
  fixedIn?: string;
  httpMethod?: string;
  endpoint?: string;
  /** What deduplication compares. Two findings sharing it are the same vulnerability. */
  dedupeKey: string;
}

export type ScannerStatus = 'ok' | 'skipped' | 'failed';

export interface ScannerResult {
  tool: string;
  status: ScannerStatus;
  /** Why it was skipped or how it failed. Required for anything but `ok`. */
  reason: string | null;
  findings: Finding[];
  durationMs: number;
  /** Where the untouched tool output was kept, when there was one. */
  rawOutputPath: string | null;
}

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  informational: 4,
};

/** Descending by severity, then alphabetical by title, so the report order is deterministic. */
export function compareSeverity(a: Finding, b: Finding): number {
  const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
  return bySeverity !== 0 ? bySeverity : a.title.localeCompare(b.title);
}

export function isMoreSevere(a: Severity, b: Severity): boolean {
  return SEVERITY_ORDER[a] < SEVERITY_ORDER[b];
}

const SEVERITY_ALIASES: Record<string, Severity> = {
  critical: 'critical',
  high: 'high',
  moderate: 'medium',
  medium: 'medium',
  low: 'low',
  info: 'informational',
  informational: 'informational',
  information: 'informational',
  none: 'informational',
  unknown: 'informational',
  warning: 'medium',
  error: 'high',
};

/**
 * Maps whatever word a scanner uses onto the five levels. An unrecognised value becomes
 * `informational` rather than being guessed upward: inventing a severity would be inventing a
 * finding.
 */
export function normaliseSeverity(raw: string | null | undefined): Severity {
  if (typeof raw !== 'string') {
    return 'informational';
  }
  return SEVERITY_ALIASES[raw.trim().toLowerCase()] ?? 'informational';
}

/**
 * CVSS v3 base score to severity, using the bands the specification itself defines. Only called
 * when a scanner gives a score and no severity word.
 */
export function severityFromCvss(score: number | null | undefined): Severity | null {
  if (typeof score !== 'number' || Number.isNaN(score) || score < 0 || score > 10) {
    return null;
  }
  if (score >= 9) return 'critical';
  if (score >= 7) return 'high';
  if (score >= 4) return 'medium';
  if (score > 0) return 'low';
  return 'informational';
}

/** Normalises `cwe-79`, `CWE_79`, `79` and `CWE-79` to `CWE-79`. Anything else is dropped. */
export function normaliseCwe(raw: string | number | null | undefined): string | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  const text = String(raw).trim();
  const match = /^(?:cwe[-_ ]?)?(\d+)$/i.exec(text);
  return match ? `CWE-${match[1]}` : null;
}

export function uniqueSorted(values: readonly (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort();
}
