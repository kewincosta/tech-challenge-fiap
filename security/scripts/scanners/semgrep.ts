import { Finding, normaliseCwe, normaliseSeverity, uniqueSorted } from '../finding';
import { owaspFromCwes, owaspFromMetadata } from '../owasp';

/**
 * Semgrep's JSON output.
 *
 * Its rules carry their own `metadata.owasp` and `metadata.cwe`, so the OWASP category comes from
 * the rule author rather than from a guess here. The CWE table is the fallback for rules that
 * publish a CWE and no OWASP category.
 */

export const TOOL_NAME = 'Semgrep';

interface SemgrepMetadata {
  cwe?: string | string[];
  owasp?: string | string[];
  references?: string | string[];
  impact?: string;
  confidence?: string;
  category?: string;
  technology?: string | string[];
}

interface SemgrepResult {
  check_id?: string;
  path?: string;
  start?: { line?: number; col?: number };
  end?: { line?: number };
  extra?: {
    message?: string;
    severity?: string;
    lines?: string;
    fix?: string;
    metadata?: SemgrepMetadata;
  };
}

export interface SemgrepReport {
  results?: SemgrepResult[];
  errors?: { message?: string; level?: string }[];
}

function asArray(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Semgrep's `ERROR`, `WARNING` and `INFO` do not mean the same thing as the five severity levels,
 * so they are mapped explicitly instead of going through the generic alias table: an `INFO`
 * finding from a security rule is a low-severity finding, not an informational note.
 */
function severityOf(result: SemgrepResult): ReturnType<typeof normaliseSeverity> {
  const raw = (result.extra?.severity ?? '').toUpperCase();
  if (raw === 'ERROR') return 'high';
  if (raw === 'WARNING') return 'medium';
  if (raw === 'INFO') return 'low';
  return normaliseSeverity(result.extra?.severity);
}

function shortRuleName(checkId: string): string {
  const parts = checkId.split('.');
  return parts[parts.length - 1] ?? checkId;
}

/** Keeps the matched source line as evidence, capped so a minified file cannot flood the report. */
function evidenceOf(result: SemgrepResult): string | null {
  const lines = result.extra?.lines?.trim();
  if (!lines) {
    return null;
  }
  return lines.length > 600 ? `${lines.slice(0, 600)}...` : lines;
}

export function parseSemgrep(report: SemgrepReport | null): Finding[] {
  const results = report?.results;
  if (!results) {
    return [];
  }

  return results.map((result) => {
    const checkId = result.check_id ?? 'unknown-rule';
    const metadata = result.extra?.metadata ?? {};
    const cwe = uniqueSorted(
      asArray(metadata.cwe).map((entry) => {
        const match = /CWE-\d+/i.exec(entry);
        return normaliseCwe(match ? match[0] : entry);
      }),
    );
    const owasp = owaspFromMetadata(asArray(metadata.owasp)) ?? owaspFromCwes(cwe);
    const line = result.start?.line;
    const location = result.path
      ? `${result.path}${typeof line === 'number' ? `:${line}` : ''}`
      : null;
    const references = uniqueSorted(asArray(metadata.references));

    return {
      id: '',
      title: shortRuleName(checkId),
      severity: severityOf(result),
      tools: [TOOL_NAME],
      category: 'sast' as const,
      owasp,
      cwe,
      cve: [],
      description: result.extra?.message?.trim() ?? `Semgrep rule ${checkId} matched.`,
      evidence: evidenceOf(result),
      impact: metadata.impact ?? null,
      recommendation:
        result.extra?.fix?.trim() ??
        (references.length > 0
          ? `Review the match against the rule guidance: ${references.join(', ')}`
          : `Review the match against rule ${checkId} and remediate or document why it does not apply.`),
      location,
      // A static rule match is a candidate until someone reads the code around it. Calling every
      // match confirmed would misrepresent what a SAST run establishes.
      confidence: 'potential' as const,
      dedupeKey: `sast:${checkId}:${location ?? 'unknown'}`,
    };
  });
}

/** Errors Semgrep reports about itself, surfaced so a partial scan is not read as a clean one. */
export function semgrepErrors(report: SemgrepReport | null): string[] {
  return (report?.errors ?? [])
    .map((error) => error.message?.trim())
    .filter((message): message is string => Boolean(message));
}
