import { Consolidation, ORDERED_SEVERITIES, severityLabel, summaryStatement } from './consolidate';
import { SecurityConfig } from './config';
import { Finding, ScannerResult } from './finding';
import { owaspTitle } from './owasp';

/**
 * Report generation. Two outputs from one model: the HTML that gets printed to PDF, and a
 * Markdown twin for anyone who would rather paste the content into a document.
 *
 * The HTML carries its own stylesheet inline and loads nothing from the network, so it opens the
 * same way on a machine that has never seen this project.
 */

export interface ReportContext {
  config: SecurityConfig;
  consolidation: Consolidation;
  results: readonly ScannerResult[];
  generatedAt: Date;
  target: string;
  /** Limitations observed during this run, not a generic list. */
  limitations: string[];
  toolVersions: { name: string; version: string | null }[];
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Escapes the characters that would break a cell, so evidence never corrupts a table. */
export function escapeMarkdownCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function statusWord(result: ScannerResult): string {
  if (result.status === 'ok') return 'Executed';
  return result.status === 'skipped' ? 'Not executed' : 'Failed';
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  const seconds = ms / 1000;
  return seconds < 60
    ? `${seconds.toFixed(1)} s`
    : `${Math.floor(seconds / 60)} min ${Math.round(seconds % 60)} s`;
}

const CATEGORY_LABEL: Record<Finding['category'], string> = {
  dependency: 'Dependencies (SCA)',
  sast: 'Source code (SAST)',
  dast: 'Running application (DAST)',
};

const CONFIDENCE_LABEL: Record<Finding['confidence'], string> = {
  confirmed: 'Confirmed',
  potential: 'Potential',
  informational: 'Informational',
};

const STYLES = `
:root{--fg:#1a1c1f;--muted:#5b6470;--line:#dfe3e8;--bg:#fff;--accent:#243b53;
--critical:#7a1020;--high:#b3261e;--medium:#9a6700;--low:#1f6f4a;--informational:#4a5568}
*{box-sizing:border-box}
body{margin:0;padding:0;background:var(--bg);color:var(--fg);
font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
.page{max-width:960px;margin:0 auto;padding:48px 40px 80px}
h1{font-size:28px;margin:0 0 4px;letter-spacing:-.2px}
h2{font-size:20px;margin:40px 0 12px;padding-bottom:6px;border-bottom:2px solid var(--line)}
h3{font-size:15px;margin:24px 0 8px}
p{margin:0 0 12px}
.sub{color:var(--muted);margin:0 0 24px}
.meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px 24px;
margin:24px 0;padding:16px;border:1px solid var(--line);border-radius:6px;background:#fafbfc}
.meta div{font-size:13px}
.meta span{display:block;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.06em}
table{width:100%;border-collapse:collapse;margin:12px 0 24px;font-size:13px}
th,td{border:1px solid var(--line);padding:7px 10px;text-align:left;vertical-align:top}
th{background:#f4f6f8;font-weight:600}
td.num,th.num{text-align:right;white-space:nowrap}
.cards{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin:16px 0 24px}
.card{border:1px solid var(--line);border-radius:6px;padding:12px;text-align:center}
.card .n{font-size:24px;font-weight:700;line-height:1.2}
.card .l{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
.sev{font-weight:600;white-space:nowrap}
.sev-critical{color:var(--critical)}.sev-high{color:var(--high)}.sev-medium{color:var(--medium)}
.sev-low{color:var(--low)}.sev-informational{color:var(--informational)}
.finding{border:1px solid var(--line);border-left:4px solid var(--line);border-radius:6px;
padding:16px 18px;margin:0 0 16px;break-inside:avoid}
.finding.critical{border-left-color:var(--critical)}.finding.high{border-left-color:var(--high)}
.finding.medium{border-left-color:var(--medium)}.finding.low{border-left-color:var(--low)}
.finding.informational{border-left-color:var(--informational)}
.finding h3{margin:0 0 8px;font-size:15px}
.finding dl{display:grid;grid-template-columns:132px 1fr;gap:4px 12px;margin:0 0 10px;font-size:13px}
.finding dt{color:var(--muted)}
.finding dd{margin:0}
pre{background:#f6f8fa;border:1px solid var(--line);border-radius:4px;padding:10px;
overflow-x:auto;font-size:12px;line-height:1.5;white-space:pre-wrap;word-break:break-word;margin:0 0 10px}
code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px}
.tag{display:inline-block;padding:1px 7px;border:1px solid var(--line);border-radius:10px;
font-size:11px;color:var(--muted);margin-right:4px;background:#fafbfc}
.note{border-left:3px solid var(--accent);background:#f6f8fa;padding:10px 14px;margin:0 0 16px;font-size:13px}
ul{margin:0 0 12px;padding-left:20px}
li{margin-bottom:4px}
footer{margin-top:48px;padding-top:16px;border-top:1px solid var(--line);
color:var(--muted);font-size:12px}
@media print{
  body{font-size:11pt}
  .page{max-width:none;padding:0}
  h2{break-after:avoid}
  .finding,table,.cards{break-inside:avoid}
  a{color:inherit;text-decoration:none}
}
`;

function metaBlock(context: ReportContext): string {
  const { config, generatedAt, target } = context;
  const entries: [string, string][] = [
    ['Generated', generatedAt.toISOString()],
    ['Target', target],
    ['API prefix', config.application.apiPrefix],
    ['Scanners executed', String(context.consolidation.executedScanners.length)],
    ['Total findings', String(context.consolidation.total)],
  ];
  return `<div class="meta">${entries
    .map(([label, value]) => `<div><span>${escapeHtml(label)}</span>${escapeHtml(value)}</div>`)
    .join('')}</div>`;
}

function summaryCards(context: ReportContext): string {
  const { counts } = context.consolidation;
  return `<div class="cards">${ORDERED_SEVERITIES.map(
    (severity) =>
      `<div class="card"><div class="n sev-${severity}">${counts[severity]}</div><div class="l">${escapeHtml(
        severityLabel(severity),
      )}</div></div>`,
  ).join('')}</div>`;
}

function toolsTable(context: ReportContext): string {
  const rows = context.results
    .map((result) => {
      const version = context.toolVersions.find((tool) => tool.name === result.tool)?.version;
      return `<tr><td>${escapeHtml(result.tool)}</td><td>${escapeHtml(version ?? 'n/a')}</td><td>${escapeHtml(
        statusWord(result),
      )}</td><td class="num">${result.status === 'ok' ? result.findings.length : '-'}</td><td>${escapeHtml(
        result.status === 'ok' ? formatDuration(result.durationMs) : (result.reason ?? ''),
      )}</td></tr>`;
    })
    .join('');
  return `<table><thead><tr><th>Tool</th><th>Version</th><th>Status</th><th class="num">Findings</th><th>Duration / reason</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function findingsTable(context: ReportContext): string {
  if (context.consolidation.total === 0) {
    return '<p>No findings were reported.</p>';
  }
  const rows = context.consolidation.findings
    .map(
      (finding) =>
        `<tr><td><code>${escapeHtml(finding.id)}</code></td><td class="sev sev-${finding.severity}">${escapeHtml(
          severityLabel(finding.severity),
        )}</td><td>${escapeHtml(truncate(finding.title, 110))}</td><td>${escapeHtml(
          finding.tools.join(', '),
        )}</td><td>${escapeHtml(finding.owasp ?? 'Not determined')}</td><td>${escapeHtml(
          CONFIDENCE_LABEL[finding.confidence],
        )}</td></tr>`,
    )
    .join('');
  return `<table><thead><tr><th>ID</th><th>Severity</th><th>Vulnerability</th><th>Tool</th><th>OWASP</th><th>Classification</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function definition(term: string, value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  return `<dt>${escapeHtml(term)}</dt><dd>${escapeHtml(value)}</dd>`;
}

function findingDetail(finding: Finding): string {
  const identifiers = [...finding.cve, ...finding.cwe];
  return `<div class="finding ${finding.severity}">
<h3>${escapeHtml(finding.id)} &middot; ${escapeHtml(finding.title)}</h3>
<dl>
${definition('Severity', severityLabel(finding.severity))}
${definition('Classification', CONFIDENCE_LABEL[finding.confidence])}
${definition('Tool', finding.tools.join(', '))}
${definition('Category', CATEGORY_LABEL[finding.category])}
${definition('OWASP Top 10', owaspTitle(finding.owasp))}
${finding.cwe.length > 0 ? definition('CWE', finding.cwe.join(', ')) : ''}
${finding.cve.length > 0 ? definition('CVE', finding.cve.join(', ')) : ''}
${definition('Location', finding.location)}
${definition('Affected versions', finding.vulnerableVersions)}
${definition('Fixed in', finding.fixedIn)}
${definition('Method', finding.httpMethod)}
</dl>
<p>${escapeHtml(finding.description)}</p>
${finding.evidence ? `<h3>Evidence</h3><pre><code>${escapeHtml(finding.evidence)}</code></pre>` : ''}
${finding.impact ? `<h3>Impact</h3><p>${escapeHtml(finding.impact)}</p>` : ''}
${finding.recommendation ? `<h3>Recommendation</h3><p>${escapeHtml(finding.recommendation)}</p>` : ''}
${identifiers.length > 0 ? `<p>${identifiers.map((id) => `<span class="tag">${escapeHtml(id)}</span>`).join('')}</p>` : ''}
</div>`;
}

function sectionFor(context: ReportContext, category: Finding['category'], empty: string): string {
  const findings = context.consolidation.findings.filter(
    (finding) => finding.category === category,
  );
  if (findings.length === 0) {
    return `<p>${escapeHtml(empty)}</p>`;
  }
  return findings.map(findingDetail).join('\n');
}

function dependencyTable(context: ReportContext): string {
  const findings = context.consolidation.findings.filter(
    (finding) => finding.category === 'dependency',
  );
  if (findings.length === 0) {
    return '';
  }
  const rows = findings
    .map(
      (finding) =>
        `<tr><td><code>${escapeHtml(finding.packageName ?? '-')}</code></td><td>${escapeHtml(
          finding.vulnerableVersions ?? '-',
        )}</td><td class="sev sev-${finding.severity}">${escapeHtml(severityLabel(finding.severity))}</td><td>${escapeHtml(
          finding.cve.join(', ') || '-',
        )}</td><td>${escapeHtml(finding.fixedIn ?? 'No fixed release recorded')}</td><td>${escapeHtml(
          finding.tools.join(', '),
        )}</td></tr>`,
    )
    .join('');
  return `<table><thead><tr><th>Package</th><th>Affected</th><th>Severity</th><th>CVE</th><th>Fixed in</th><th>Reported by</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function owaspTable(context: ReportContext): string {
  const rows = context.consolidation.owaspRows
    .map(
      (row) =>
        `<tr><td><code>${escapeHtml(row.id)}</code></td><td>${escapeHtml(row.title)}</td><td class="num">${row.count}</td></tr>`,
    )
    .join('');
  const undetermined =
    context.consolidation.notDetermined > 0
      ? `<tr><td colspan="2">Not determined</td><td class="num">${context.consolidation.notDetermined}</td></tr>`
      : '';
  return `<table><thead><tr><th>Category</th><th>Title</th><th class="num">Findings</th></tr></thead><tbody>${rows}${undetermined}</tbody></table>`;
}

/** Ranked by what would remove the most severe findings first. */
function recommendations(context: ReportContext): string[] {
  const { consolidation } = context;
  const items: string[] = [];
  const deps = consolidation.findings.filter((f) => f.category === 'dependency');
  const upgradable = deps.filter((f) => f.fixedIn);
  const sast = consolidation.findings.filter((f) => f.category === 'sast');
  const dast = consolidation.findings.filter((f) => f.category === 'dast');

  if (upgradable.length > 0) {
    items.push(
      `Upgrade the ${upgradable.length} dependencies with a published fixed release. Review each change before applying it; this tool never modifies dependencies on its own.`,
    );
  }
  if (deps.length > upgradable.length) {
    items.push(
      `For the ${deps.length - upgradable.length} advisories with no fixed release, record whether the vulnerable code path is reachable from this application and track the advisory.`,
    );
  }
  if (sast.length > 0) {
    items.push(
      `Triage the ${sast.length} static analysis matches. Each is a candidate until read in context: confirm it, fix it, or document why the rule does not apply here.`,
    );
  }
  if (dast.length > 0) {
    items.push(
      `Review the ${dast.length} findings from the running application, starting with the response headers and error handling that a baseline scan reaches without credentials.`,
    );
  }
  if (consolidation.skippedScanners.length + consolidation.failedScanners.length > 0) {
    items.push(
      'Re-run the assessment with every scanner available, so the result covers all four analysis types.',
    );
  }
  items.push(
    'Run this assessment on every dependency change, so a newly published advisory is caught by the next build rather than at the next audit.',
  );
  return items;
}

export function buildHtmlReport(context: ReportContext): string {
  const { config, consolidation } = context;
  const list = (items: readonly string[]): string =>
    `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(config.report.title)}</title>
<style>${STYLES}</style>
</head>
<body>
<div class="page">
<h1>${escapeHtml(config.report.title)}</h1>
<p class="sub">Workshop Management API &middot; automated assessment</p>
${metaBlock(context)}

<h2>1. Executive Summary</h2>
${summaryCards(context)}
<p><strong>Total findings: ${consolidation.total}</strong></p>
<p>${escapeHtml(summaryStatement(consolidation))}</p>
${
  consolidation.corroborated > 0
    ? `<p>${consolidation.corroborated} finding(s) were reported independently by more than one tool and are shown once, listing every tool that found them.</p>`
    : ''
}

<h2>2. Scope</h2>
<p>The assessment covers this repository and the application it builds:</p>
<ul>
<li>Application source under <code>src/</code>, analysed statically.</li>
<li>The dependency tree declared by <code>package.json</code> and <code>package-lock.json</code>.</li>
<li>The running HTTP API at <code>${escapeHtml(context.target)}</code>, probed without credentials.</li>
</ul>
<p>Infrastructure, the container host, the database and the network are out of scope.</p>

<h2>3. Methodology</h2>
<p>Four automated analyses, each covering what the others cannot:</p>
<ul>
<li><strong>SCA</strong> reads the declared dependency tree against public advisory databases.</li>
<li><strong>SAST</strong> matches security rules against the source without running it.</li>
<li><strong>DAST</strong> exercises the deployed application over HTTP and observes its responses.</li>
</ul>
<p>Every result is normalised into one shape, deduplicated across tools, and mapped to the OWASP Top 10 2021 only where the tool supplied a CWE or an OWASP category. Nothing is classified by inference.</p>

<h2>4. Tools Used</h2>
${toolsTable(context)}

<h2>5. Results Summary</h2>
<table><thead><tr><th>Analysis</th><th class="num">Findings</th></tr></thead><tbody>
<tr><td>Dependencies (SCA)</td><td class="num">${consolidation.byCategory.dependency}</td></tr>
<tr><td>Source code (SAST)</td><td class="num">${consolidation.byCategory.sast}</td></tr>
<tr><td>Running application (DAST)</td><td class="num">${consolidation.byCategory.dast}</td></tr>
</tbody></table>
${findingsTable(context)}

<h2>6. Vulnerabilities Found</h2>
<h3>6.1 Dependencies</h3>
${dependencyTable(context)}
${sectionFor(context, 'dependency', 'No vulnerable dependencies were reported by the scanners that ran.')}
<h3>6.2 Source code</h3>
${sectionFor(context, 'sast', 'No static analysis findings were reported by the scanners that ran.')}
<h3>6.3 Running application</h3>
${sectionFor(context, 'dast', 'No dynamic analysis findings were reported by the scanners that ran.')}

<h2>7. OWASP Top 10 Mapping</h2>
<p>Findings are counted under a category only when the reporting tool supplied a CWE or an OWASP identifier that maps to it. A finding without that basis is counted as not determined rather than assigned a nearest category.</p>
${owaspTable(context)}

<h2>8. Recommendations</h2>
${list(recommendations(context))}

<h2>9. Limitations</h2>
<div class="note">A scanner that did not run is not a clean result. The tools table above states which analyses produced results and which did not.</div>
${list(context.limitations)}

<h2>10. Conclusion</h2>
<p>${escapeHtml(summaryStatement(consolidation))}</p>
<p>This assessment reflects what automated tooling detects at the time of the run. It is evidence about a defined scope, not a statement that the application is free of vulnerabilities: the classifications above distinguish what a tool confirmed from what it flagged as a candidate for review.</p>

<footer>Generated by the project's security assessment tool on ${escapeHtml(context.generatedAt.toISOString())}.</footer>
</div>
</body>
</html>`;
}

export function buildMarkdownReport(context: ReportContext): string {
  const { consolidation, config } = context;
  const lines: string[] = [];
  const push = (...values: string[]): void => {
    lines.push(...values);
  };

  push(`# ${config.report.title}`, '');
  push(`Generated: ${context.generatedAt.toISOString()}  `, `Target: ${context.target}`, '');

  push('## 1. Executive Summary', '');
  push(`Total findings: ${consolidation.total}`, '');
  for (const severity of ORDERED_SEVERITIES) {
    push(`- ${severityLabel(severity)}: ${consolidation.counts[severity]}`);
  }
  push('', summaryStatement(consolidation), '');

  push('## 2. Scope', '');
  push('- Application source under `src/`, analysed statically.');
  push('- The dependency tree declared by `package.json` and `package-lock.json`.');
  push(`- The running HTTP API at ${context.target}, probed without credentials.`, '');

  push('## 3. Methodology', '');
  push('SCA over the dependency tree, SAST over the source, and DAST against the running API.');
  push(
    'Results are normalised into one shape, deduplicated across tools, and mapped to the OWASP Top 10 2021 only where a CWE or OWASP identifier was supplied.',
    '',
  );

  push('## 4. Tools Used', '');
  push('| Tool | Status | Findings | Duration / reason |', '| --- | --- | ---: | --- |');
  for (const result of context.results) {
    const detail =
      result.status === 'ok' ? formatDuration(result.durationMs) : (result.reason ?? '');
    push(
      `| ${escapeMarkdownCell(result.tool)} | ${statusWord(result)} | ${
        result.status === 'ok' ? result.findings.length : '-'
      } | ${escapeMarkdownCell(detail)} |`,
    );
  }
  push('');

  push('## 5. Results Summary', '');
  push('| Analysis | Findings |', '| --- | ---: |');
  push(`| Dependencies (SCA) | ${consolidation.byCategory.dependency} |`);
  push(`| Source code (SAST) | ${consolidation.byCategory.sast} |`);
  push(`| Running application (DAST) | ${consolidation.byCategory.dast} |`, '');

  if (consolidation.total > 0) {
    push('| ID | Severity | Vulnerability | Tool | OWASP |', '| --- | --- | --- | --- | --- |');
    for (const finding of consolidation.findings) {
      push(
        `| ${finding.id} | ${severityLabel(finding.severity)} | ${escapeMarkdownCell(
          truncate(finding.title, 110),
        )} | ${escapeMarkdownCell(finding.tools.join(', '))} | ${finding.owasp ?? 'Not determined'} |`,
      );
    }
    push('');
  }

  push('## 6. Vulnerabilities Found', '');
  if (consolidation.total === 0) {
    push('No findings were reported.', '');
  }
  for (const finding of consolidation.findings) {
    push(`### ${finding.id} - ${finding.title}`, '');
    push(`- Severity: ${severityLabel(finding.severity)}`);
    push(`- Classification: ${CONFIDENCE_LABEL[finding.confidence]}`);
    push(`- Tool: ${finding.tools.join(', ')}`);
    push(`- OWASP: ${owaspTitle(finding.owasp)}`);
    if (finding.cwe.length > 0) push(`- CWE: ${finding.cwe.join(', ')}`);
    if (finding.cve.length > 0) push(`- CVE: ${finding.cve.join(', ')}`);
    if (finding.location) push(`- Location: ${finding.location}`);
    if (finding.fixedIn) push(`- Fixed in: ${finding.fixedIn}`);
    push('', finding.description, '');
    if (finding.evidence) push('```text', finding.evidence, '```', '');
    if (finding.recommendation) push(`Recommendation: ${finding.recommendation}`, '');
  }

  push('## 7. OWASP Top 10 Mapping', '');
  push('| Category | Title | Findings |', '| --- | --- | ---: |');
  for (const row of consolidation.owaspRows) {
    push(`| ${row.id} | ${row.title} | ${row.count} |`);
  }
  if (consolidation.notDetermined > 0) {
    push(`| - | Not determined | ${consolidation.notDetermined} |`);
  }
  push('');

  push('## 8. Recommendations', '');
  for (const item of recommendations(context)) {
    push(`- ${item}`);
  }
  push('');

  push('## 9. Limitations', '');
  for (const item of context.limitations) {
    push(`- ${item}`);
  }
  push('');

  push('## 10. Conclusion', '');
  push(summaryStatement(consolidation), '');
  push(
    'This assessment reflects what automated tooling detects at the time of the run. It is evidence about a defined scope, not a statement that the application is free of vulnerabilities.',
    '',
  );

  return lines.join('\n');
}
