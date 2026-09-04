import { Finding, Severity, normaliseCwe, uniqueSorted } from '../finding';
import { owaspFromCwes } from '../owasp';

/**
 * OWASP ZAP's traditional JSON report.
 *
 * ZAP groups every occurrence of an alert under one entry with an `instances` array, which is
 * already the grouping the report wants: one row per alert, with the affected endpoints listed
 * inside it.
 */

export const TOOL_NAME = 'OWASP ZAP';

interface ZapInstance {
  uri?: string;
  method?: string;
  param?: string;
  attack?: string;
  evidence?: string;
  otherinfo?: string;
}

interface ZapAlert {
  pluginid?: string;
  alertRef?: string;
  alert?: string;
  name?: string;
  riskcode?: string;
  confidence?: string;
  riskdesc?: string;
  desc?: string;
  solution?: string;
  reference?: string;
  cweid?: string;
  wascid?: string;
  count?: string;
  instances?: ZapInstance[];
}

interface ZapSite {
  '@name'?: string;
  alerts?: ZapAlert[];
}

export interface ZapReport {
  site?: ZapSite[];
}

/** ZAP's riskcode: 0 informational, 1 low, 2 medium, 3 high. There is no critical level. */
const RISK_BY_CODE: Record<string, Severity> = {
  '0': 'informational',
  '1': 'low',
  '2': 'medium',
  '3': 'high',
};

/** ZAP's confidence: 0 false positive, 1 low, 2 medium, 3 high, 4 confirmed. */
function confidenceOf(alert: ZapAlert): Finding['confidence'] {
  const raw = (alert.confidence ?? '').trim();
  if (raw === '4') {
    return 'confirmed';
  }
  if (raw === '0') {
    // ZAP's own "false positive" confidence. Reported as informational rather than dropped or
    // labelled a false positive, since that verdict needs a human (requirement 18).
    return 'informational';
  }
  return 'potential';
}

/** ZAP writes its descriptions and solutions as HTML fragments. */
export function stripHtml(value: string | undefined): string {
  if (!value) {
    return '';
  }
  return value
    .replace(/<\/(p|br|li|div)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function evidenceOf(instances: readonly ZapInstance[]): string | null {
  const lines = instances
    .slice(0, 5)
    .map((instance) => {
      const method = instance.method ?? 'GET';
      const uri = instance.uri ?? '';
      const evidence = instance.evidence?.trim();
      const param = instance.param?.trim();
      const details = [param ? `param: ${param}` : null, evidence ? `evidence: ${evidence}` : null]
        .filter(Boolean)
        .join(', ');
      return details ? `${method} ${uri} (${details})` : `${method} ${uri}`;
    })
    .filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return null;
  }
  const extra = instances.length > 5 ? `\n... and ${instances.length - 5} more instances` : '';
  return `${lines.join('\n')}${extra}`;
}

export function parseZap(report: ZapReport | null): Finding[] {
  const sites = report?.site;
  if (!sites) {
    return [];
  }

  const findings: Finding[] = [];
  for (const site of sites) {
    for (const alert of site.alerts ?? []) {
      const instances = alert.instances ?? [];
      const cwe = uniqueSorted([normaliseCwe(alert.cweid)]);
      const name = alert.name ?? alert.alert ?? 'ZAP alert';
      const first = instances[0];

      findings.push({
        id: '',
        title: name,
        severity: RISK_BY_CODE[(alert.riskcode ?? '0').trim()] ?? 'informational',
        tools: [TOOL_NAME],
        category: 'dast',
        owasp: owaspFromCwes(cwe),
        cwe,
        cve: [],
        description: stripHtml(alert.desc) || `ZAP reported ${name}.`,
        evidence: evidenceOf(instances),
        impact: null,
        recommendation: stripHtml(alert.solution) || null,
        location: site['@name'] ?? null,
        confidence: confidenceOf(alert),
        httpMethod: first?.method,
        endpoint: first?.uri,
        // Keyed on alertRef, not pluginid: one plugin can raise several distinct alerts, and
        // 10049 does exactly that ("Non-Storable Content" and "Storable and Cacheable Content").
        // Keying on the plugin would merge them and silently drop one.
        dedupeKey: `dast:${alert.alertRef ?? alert.pluginid ?? name}:${site['@name'] ?? ''}`,
      });
    }
  }

  return findings;
}
