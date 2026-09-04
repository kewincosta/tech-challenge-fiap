import 'dotenv/config';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * The short report.
 *
 * The full assessment answers "what did the tools say". This one answers "what is the state, and
 * what changed", which is the question a reader who is not going to run the scanners actually
 * has. It is generated from snapshots of the full report, so the two can never disagree.
 *
 *   npm run security:snapshot before   # freeze the current findings as the baseline
 *   ... fix things ...
 *   npm run security:scan              # measure again
 *   npm run security:snapshot after    # freeze the new findings
 *   npm run security:summary           # write the before and after comparison
 */

const PROJECT_ROOT = resolve(__dirname, '..', '..');
const REPORTS_DIR = join(PROJECT_ROOT, 'security', 'reports');
const SNAPSHOT_DIR = join(REPORTS_DIR, 'snapshots');

export type Phase = 'before' | 'after';

export interface SnapshotFinding {
  id: string;
  title: string;
  severity: string;
  tools: string[];
  owasp: string | null;
  cwe: string[];
  cve: string[];
  category: string;
  confidence: string;
  location: string | null;
  packageName?: string;
  fixedIn?: string;
  /** Filled in by hand after the fix, so the report says what was actually done. */
  resolution?: string;
}

export interface Snapshot {
  phase: Phase;
  generatedAt: string;
  target: string;
  counts: Record<string, number>;
  total: number;
  scanners: { tool: string; status: string; findings: number; reason: string | null }[];
  findings: SnapshotFinding[];
}

export function snapshotPath(phase: Phase): string {
  return join(SNAPSHOT_DIR, `${phase}.json`);
}

export function readSnapshot(phase: Phase): Snapshot | null {
  const path = snapshotPath(phase);
  if (!existsSync(path)) {
    return null;
  }
  return JSON.parse(readFileSync(path, 'utf8')) as Snapshot;
}

export function writeSnapshot(snapshot: Snapshot): string {
  mkdirSync(SNAPSHOT_DIR, { recursive: true });
  const path = snapshotPath(snapshot.phase);
  writeFileSync(path, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  return path;
}

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'informational'] as const;

export function severityLabel(severity: string): string {
  return severity.charAt(0).toUpperCase() + severity.slice(1);
}

/**
 * Compares the two runs by finding id is wrong: ids are positional and shift when a finding is
 * removed. Comparison is by what identifies the vulnerability itself.
 */
export function findingKey(finding: SnapshotFinding): string {
  if (finding.cve.length > 0) {
    return `${finding.packageName ?? finding.title}:${[...finding.cve].sort().join(',')}`;
  }
  return `${finding.category}:${finding.packageName ?? finding.title}`;
}

export interface Comparison {
  resolved: SnapshotFinding[];
  remaining: SnapshotFinding[];
  introduced: SnapshotFinding[];
}

export function compare(before: Snapshot, after: Snapshot): Comparison {
  const afterKeys = new Set(after.findings.map(findingKey));
  const beforeKeys = new Set(before.findings.map(findingKey));
  return {
    resolved: before.findings.filter((finding) => !afterKeys.has(findingKey(finding))),
    remaining: before.findings.filter((finding) => afterKeys.has(findingKey(finding))),
    introduced: after.findings.filter((finding) => !beforeKeys.has(findingKey(finding))),
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const STYLES = `
:root{--fg:#1a1c1f;--muted:#5b6470;--line:#dfe3e8;--ok:#1f6f4a;--bad:#b3261e;--warn:#9a6700}
*{box-sizing:border-box}
body{margin:0;background:#fff;color:var(--fg);
font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
.page{max-width:900px;margin:0 auto;padding:44px 40px 72px}
h1{font-size:26px;margin:0 0 4px}
h2{font-size:19px;margin:36px 0 12px;padding-bottom:6px;border-bottom:2px solid var(--line)}
h3{font-size:15px;margin:22px 0 8px}
p{margin:0 0 12px}
.sub{color:var(--muted);margin:0 0 22px}
table{width:100%;border-collapse:collapse;margin:12px 0 22px;font-size:13px}
th,td{border:1px solid var(--line);padding:7px 10px;text-align:left;vertical-align:top}
th{background:#f4f6f8;font-weight:600}
td.num,th.num{text-align:right;white-space:nowrap}
.ba{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:18px 0 24px}
.panel{border:1px solid var(--line);border-radius:6px;padding:16px}
.panel h3{margin:0 0 10px;font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
.big{font-size:34px;font-weight:700;line-height:1}
.delta{font-size:13px;color:var(--muted);margin-top:6px}
.good{color:var(--ok);font-weight:600}
.bad{color:var(--bad);font-weight:600}
.warn{color:var(--warn);font-weight:600}
.fix{border:1px solid var(--line);border-left:4px solid var(--ok);border-radius:6px;
padding:14px 16px;margin:0 0 14px;break-inside:avoid}
.fix.open{border-left-color:var(--warn)}
.fix h3{margin:0 0 8px}
.fix dl{display:grid;grid-template-columns:110px 1fr;gap:3px 12px;margin:0 0 8px;font-size:13px}
.fix dt{color:var(--muted)}
.fix dd{margin:0}
code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px}
ul{margin:0 0 12px;padding-left:20px}
li{margin-bottom:4px}
footer{margin-top:44px;padding-top:14px;border-top:1px solid var(--line);color:var(--muted);font-size:12px}
@media print{body{font-size:11pt}.page{max-width:none;padding:0}
h2{break-after:avoid}table,.fix,.ba{break-inside:avoid}a{color:inherit;text-decoration:none}}
`;

function countsRow(snapshot: Snapshot): string {
  return SEVERITY_ORDER.map(
    (severity) => `${severityLabel(severity)} ${snapshot.counts[severity] ?? 0}`,
  ).join(' · ');
}

function deltaWord(before: number, after: number): string {
  if (after < before) {
    return `<span class="good">-${before - after}</span>`;
  }
  if (after > before) {
    return `<span class="bad">+${after - before}</span>`;
  }
  return '<span class="warn">sem mudança</span>';
}

export function buildSummaryHtml(
  before: Snapshot,
  after: Snapshot,
  comparison: Comparison,
): string {
  const severityRows = SEVERITY_ORDER.map((severity) => {
    const b = before.counts[severity] ?? 0;
    const a = after.counts[severity] ?? 0;
    return `<tr><td>${severityLabel(severity)}</td><td class="num">${b}</td><td class="num">${a}</td><td class="num">${deltaWord(b, a)}</td></tr>`;
  }).join('');

  const fixCard = (finding: SnapshotFinding, resolved: boolean): string => `
<div class="fix ${resolved ? '' : 'open'}">
<h3>${escapeHtml(finding.title)}</h3>
<dl>
<dt>Severidade</dt><dd>${escapeHtml(severityLabel(finding.severity))}</dd>
<dt>Ferramenta</dt><dd>${escapeHtml(finding.tools.join(', '))}</dd>
<dt>OWASP</dt><dd>${escapeHtml(finding.owasp ?? 'Não determinado')}</dd>
${finding.cve.length > 0 ? `<dt>CVE</dt><dd>${escapeHtml(finding.cve.join(', '))}</dd>` : ''}
${finding.cwe.length > 0 ? `<dt>CWE</dt><dd>${escapeHtml(finding.cwe.join(', '))}</dd>` : ''}
${finding.location ? `<dt>Local</dt><dd><code>${escapeHtml(finding.location)}</code></dd>` : ''}
<dt>Situação</dt><dd>${resolved ? '<span class="good">Resolvido</span>' : '<span class="warn">Em aberto</span>'}</dd>
</dl>
${finding.resolution ? `<p>${escapeHtml(finding.resolution)}</p>` : ''}
</div>`;

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Relatório de vulnerabilidades: antes e depois</title>
<style>${STYLES}</style>
</head>
<body>
<div class="page">
<h1>Relatório de vulnerabilidades</h1>
<p class="sub">Workshop Management API · comparação antes e depois das correções</p>

<h2>Resumo</h2>
<div class="ba">
<div class="panel">
<h3>Antes</h3>
<div class="big">${before.total}</div>
<div class="delta">${escapeHtml(countsRow(before))}</div>
<div class="delta">${escapeHtml(new Date(before.generatedAt).toLocaleString('pt-BR'))}</div>
</div>
<div class="panel">
<h3>Depois</h3>
<div class="big">${after.total}</div>
<div class="delta">${escapeHtml(countsRow(after))}</div>
<div class="delta">${escapeHtml(new Date(after.generatedAt).toLocaleString('pt-BR'))}</div>
</div>
</div>

<table>
<thead><tr><th>Severidade</th><th class="num">Antes</th><th class="num">Depois</th><th class="num">Variação</th></tr></thead>
<tbody>${severityRows}
<tr><th>Total</th><th class="num">${before.total}</th><th class="num">${after.total}</th><th class="num">${deltaWord(before.total, after.total)}</th></tr>
</tbody></table>

<h2>Ferramentas executadas</h2>
<table>
<thead><tr><th>Ferramenta</th><th>Análise</th><th class="num">Antes</th><th class="num">Depois</th></tr></thead>
<tbody>${before.scanners
    .map((scanner) => {
      const afterScanner = after.scanners.find((candidate) => candidate.tool === scanner.tool);
      const kind =
        scanner.tool === 'Semgrep' ? 'SAST' : scanner.tool === 'OWASP ZAP' ? 'DAST' : 'SCA';
      return `<tr><td>${escapeHtml(scanner.tool)}</td><td>${kind}</td><td class="num">${scanner.status === 'ok' ? scanner.findings : '-'}</td><td class="num">${afterScanner?.status === 'ok' ? afterScanner.findings : '-'}</td></tr>`;
    })
    .join('')}</tbody></table>

<h2>Achados resolvidos (${comparison.resolved.length})</h2>
${comparison.resolved.length === 0 ? '<p>Nenhum achado foi resolvido entre as duas execuções.</p>' : comparison.resolved.map((finding) => fixCard(finding, true)).join('')}

<h2>Achados em aberto (${comparison.remaining.length})</h2>
${comparison.remaining.length === 0 ? '<p>Nenhum achado permaneceu.</p>' : comparison.remaining.map((finding) => fixCard(finding, false)).join('')}

${
  comparison.introduced.length > 0
    ? `<h2>Achados novos (${comparison.introduced.length})</h2>
<p>Encontrados na segunda execução e ausentes na primeira. A cobertura da análise dinâmica mudou entre as duas, o que explica achados que só aparecem depois.</p>
${comparison.introduced.map((finding) => fixCard(finding, false)).join('')}`
    : ''
}

<h2>Como foi medido</h2>
<p>As duas execuções usaram o mesmo comando, <code>npm run security:scan</code>, contra o mesmo alvo, com as mesmas quatro ferramentas: npm audit e OWASP Dependency-Check sobre as dependências, Semgrep sobre o código, e OWASP ZAP contra a aplicação em execução.</p>
<p>Os números vieram do relatório completo da ferramenta, congelado em <code>security/reports/snapshots/</code> antes e depois das correções. Este documento é gerado a partir desses dois arquivos, então não pode divergir do relatório técnico.</p>

<footer>Gerado em ${escapeHtml(new Date().toLocaleString('pt-BR'))} a partir de security/reports/snapshots/.</footer>
</div>
</body>
</html>`;
}

export function buildSummaryMarkdown(
  before: Snapshot,
  after: Snapshot,
  comparison: Comparison,
): string {
  const lines: string[] = [];
  const push = (...values: string[]): void => {
    lines.push(...values);
  };

  push('# Relatório de vulnerabilidades: antes e depois', '');
  push('## Resumo', '');
  push('| Severidade | Antes | Depois | Variação |', '| --- | ---: | ---: | ---: |');
  for (const severity of SEVERITY_ORDER) {
    const b = before.counts[severity] ?? 0;
    const a = after.counts[severity] ?? 0;
    const delta = a === b ? 'sem mudança' : a < b ? `-${b - a}` : `+${a - b}`;
    push(`| ${severityLabel(severity)} | ${b} | ${a} | ${delta} |`);
  }
  const totalDelta =
    after.total === before.total
      ? 'sem mudança'
      : after.total < before.total
        ? `-${before.total - after.total}`
        : `+${after.total - before.total}`;
  push(`| **Total** | **${before.total}** | **${after.total}** | **${totalDelta}** |`, '');

  push('## Achados resolvidos', '');
  if (comparison.resolved.length === 0) {
    push('Nenhum.', '');
  }
  for (const finding of comparison.resolved) {
    push(`### ${finding.title}`, '');
    push(`- Severidade: ${severityLabel(finding.severity)}`);
    push(`- Ferramenta: ${finding.tools.join(', ')}`);
    push(`- OWASP: ${finding.owasp ?? 'Não determinado'}`);
    if (finding.cve.length > 0) push(`- CVE: ${finding.cve.join(', ')}`);
    if (finding.location) push(`- Local: ${finding.location}`);
    if (finding.resolution) push('', finding.resolution);
    push('');
  }

  push('## Achados em aberto', '');
  if (comparison.remaining.length === 0) {
    push('Nenhum.', '');
  }
  for (const finding of comparison.remaining) {
    push(`### ${finding.title}`, '');
    push(`- Severidade: ${severityLabel(finding.severity)}`);
    push(`- Ferramenta: ${finding.tools.join(', ')}`);
    if (finding.resolution) push('', finding.resolution);
    push('');
  }

  return lines.join('\n');
}
