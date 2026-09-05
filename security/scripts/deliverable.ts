import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  Comparison,
  Snapshot,
  SnapshotFinding,
  compare,
  findingKey,
  readSnapshot,
} from './summary-report';

/**
 * The submission document.
 *
 * One page that carries what the assignment asks for (group, participants, links) plus the
 * before and after of the security assessment, built from the two frozen snapshots so the
 * numbers cannot drift from the technical report.
 */

const PROJECT_ROOT = resolve(__dirname, '..', '..');
const REPORTS_DIR = join(PROJECT_ROOT, 'security', 'reports');
const DELIVERABLE_FILE = join(PROJECT_ROOT, 'security', 'config', 'deliverable.json');
const RESOLUTIONS_FILE = join(PROJECT_ROOT, 'security', 'config', 'resolutions.json');

export interface Participant {
  name: string;
  discord: string;
}

export interface DeliverableInfo {
  group: string;
  course: string;
  participants: Participant[];
  documentationUrl: string;
  repositoryUrl: string;
}

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'informational'] as const;

const SEVERITY_LABEL: Record<string, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  informational: 'Informational',
};

export function severityLabel(severity: string): string {
  return SEVERITY_LABEL[severity] ?? severity;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Reads the outcome of a finding out of its written resolution, for the status column. */
export function outcomeOf(
  resolution: string | undefined,
): 'fixed' | 'false-positive' | 'no-defect' | 'open' {
  if (!resolution) {
    return 'open';
  }
  const text = resolution.toLowerCase();
  if (text.startsWith('false positive')) {
    return 'false-positive';
  }
  if (text.startsWith('no defect')) {
    return 'no-defect';
  }
  if (text.startsWith('fixed') || text.startsWith('analysed and fixed')) {
    return 'fixed';
  }
  return 'open';
}

const OUTCOME_LABEL: Record<ReturnType<typeof outcomeOf>, string> = {
  fixed: 'Fixed',
  'false-positive': 'False positive',
  'no-defect': 'No defect',
  open: 'Open',
};

const STYLES = `
:root{--fg:#16181b;--muted:#5b6470;--line:#d9dee4;--accent:#1f3a5f;
--ok:#1c6b47;--fp:#5b6470;--open:#9a6700;--crit:#7a1020;--high:#b3261e;--med:#9a6700;--low:#1f6f4a;--info:#4a5568}
*{box-sizing:border-box}
body{margin:0;background:#fff;color:var(--fg);
font:13px/1.62 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
.page{max-width:820px;margin:0 auto;padding:40px 44px 64px}
.cover{border-bottom:3px solid var(--accent);padding-bottom:22px;margin-bottom:8px}
.cover .kicker{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin:0 0 8px}
h1{font-size:27px;margin:0 0 6px;letter-spacing:-.3px;color:var(--accent)}
.cover .lead{font-size:15px;color:var(--muted);margin:0}
h2{font-size:17px;margin:34px 0 10px;padding-bottom:5px;border-bottom:2px solid var(--line);color:var(--accent)}
h3{font-size:14px;margin:20px 0 7px}
p{margin:0 0 11px}
dl.ident{display:grid;grid-template-columns:190px 1fr;gap:7px 16px;margin:18px 0 4px}
dl.ident dt{color:var(--muted);font-size:12px}
dl.ident dd{margin:0}
table{width:100%;border-collapse:collapse;margin:11px 0 20px;font-size:12px}
th,td{border:1px solid var(--line);padding:6px 9px;text-align:left;vertical-align:top}
th{background:#f2f5f8;font-weight:600}
td.num,th.num{text-align:right;white-space:nowrap}
.scoreboard{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin:18px 0 22px}
.score{border:1px solid var(--line);border-radius:6px;padding:14px;text-align:center}
.score .lbl{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
.score .val{font-size:30px;font-weight:700;line-height:1.15;margin-top:4px}
.score .sub{font-size:11px;color:var(--muted);margin-top:3px}
.down{color:var(--ok)}
.sev-critical{color:var(--crit);font-weight:600}
.sev-high{color:var(--high);font-weight:600}
.sev-medium{color:var(--med);font-weight:600}
.sev-low{color:var(--low);font-weight:600}
.sev-informational{color:var(--info);font-weight:600}
.pill{display:inline-block;padding:1px 8px;border-radius:10px;font-size:11px;font-weight:600;white-space:nowrap}
.pill.fixed{background:#e6f4ec;color:var(--ok)}
.pill.false-positive{background:#eef1f4;color:var(--fp)}
.pill.no-defect{background:#eef1f4;color:var(--fp)}
.pill.open{background:#fdf3e0;color:var(--open)}
.item{border:1px solid var(--line);border-left:4px solid var(--ok);border-radius:5px;
padding:13px 15px;margin:0 0 12px;break-inside:avoid}
.item.false-positive,.item.no-defect{border-left-color:var(--fp)}
.item.open{border-left-color:var(--open)}
.item h3{margin:0 0 7px;font-size:13.5px}
.item .meta{font-size:11.5px;color:var(--muted);margin:0 0 8px}
.item p{margin:0;font-size:12.5px}
code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11.5px;
background:#f4f6f8;padding:1px 4px;border-radius:3px}
ul{margin:0 0 11px;padding-left:19px}
li{margin-bottom:3px}
.note{border-left:3px solid var(--accent);background:#f5f8fb;padding:9px 13px;margin:0 0 15px;font-size:12px}
footer{margin-top:38px;padding-top:12px;border-top:1px solid var(--line);color:var(--muted);font-size:11px}
@page{margin:16mm 14mm}
@media print{
  body{font-size:10.5pt}
  .page{max-width:none;padding:0}
  h2{break-after:avoid}
  table,.item,.scoreboard{break-inside:avoid}
  a{color:inherit;text-decoration:none}
  .pagebreak{break-before:page}
}
`;

function severityRows(before: Snapshot, after: Snapshot): string {
  return SEVERITY_ORDER.map((severity) => {
    const b = before.counts[severity] ?? 0;
    const a = after.counts[severity] ?? 0;
    const delta = a === b ? '=' : a < b ? `<span class="down">-${b - a}</span>` : `+${a - b}`;
    return `<tr><td class="sev-${severity}">${severityLabel(severity)}</td><td class="num">${b}</td><td class="num">${a}</td><td class="num">${delta}</td></tr>`;
  }).join('');
}

function itemCard(finding: SnapshotFinding, resolutions: Record<string, string>): string {
  const resolution = resolutions[findingKey(finding)];
  const outcome = outcomeOf(resolution);
  const identifiers = [...finding.cve, ...finding.cwe].join(', ');
  const meta = [
    `Severity: ${severityLabel(finding.severity)}`,
    `Tool: ${finding.tools.join(', ')}`,
    `OWASP: ${finding.owasp ?? 'not determined'}`,
    identifiers ? `Identifiers: ${identifiers}` : null,
    finding.location ? `Location: ${finding.location}` : null,
  ]
    .filter(Boolean)
    .join(' &middot; ');

  return `<div class="item ${outcome}">
<h3>${escapeHtml(finding.title)} <span class="pill ${outcome}">${OUTCOME_LABEL[outcome]}</span></h3>
<p class="meta">${meta}</p>
<p>${escapeHtml(resolution ?? 'No treatment recorded.')}</p>
</div>`;
}

export function buildDeliverableHtml(
  info: DeliverableInfo,
  before: Snapshot,
  after: Snapshot,
  comparison: Comparison,
  resolutions: Record<string, string>,
): string {
  const all = before.findings;
  const fixed = all.filter((f) => outcomeOf(resolutions[findingKey(f)]) === 'fixed').length;
  const falsePositives = all.filter(
    (f) => outcomeOf(resolutions[findingKey(f)]) === 'false-positive',
  ).length;
  const noDefect = all.filter((f) => outcomeOf(resolutions[findingKey(f)]) === 'no-defect').length;

  const scannerRows = before.scanners
    .map((scanner) => {
      const afterScanner = after.scanners.find((candidate) => candidate.tool === scanner.tool);
      const kind =
        scanner.tool === 'Semgrep' ? 'SAST' : scanner.tool === 'OWASP ZAP' ? 'DAST' : 'SCA';
      return `<tr><td>${escapeHtml(scanner.tool)}</td><td>${kind}</td><td class="num">${scanner.status === 'ok' ? scanner.findings : '-'}</td><td class="num">${afterScanner?.status === 'ok' ? afterScanner.findings : '-'}</td></tr>`;
    })
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Tech Challenge - Group ${escapeHtml(info.group)}</title>
<style>${STYLES}</style>
</head>
<body>
<div class="page">

<div class="cover">
<p class="kicker">${escapeHtml(info.course)}</p>
<h1>Tech Challenge: Group ${escapeHtml(info.group)}</h1>
<p class="lead">Auto repair shop management system and vulnerability assessment</p>
</div>

<dl class="ident">
<dt>Group</dt><dd>${escapeHtml(info.group)}</dd>
<dt>Participants</dt><dd>${info.participants
    .map((p) => `${escapeHtml(p.name)} (Discord: ${escapeHtml(p.discord)})`)
    .join('<br>')}</dd>
<dt>Documentation</dt><dd><a href="${escapeHtml(info.documentationUrl)}">${escapeHtml(info.documentationUrl)}</a></dd>
<dt>Repository</dt><dd><a href="${escapeHtml(info.repositoryUrl)}">${escapeHtml(info.repositoryUrl)}</a></dd>
</dl>

<h2>1. Vulnerability assessment</h2>

<p>The system was put through an automated security assessment with four tools recognised by
OWASP, covering the three complementary angles: the declared dependencies, the source code and the
running application. The assessment ran twice, before and after the fixes, with the same command
and against the same target.</p>

<div class="scoreboard">
<div class="score"><div class="lbl">Before</div><div class="val">${before.total}</div><div class="sub">findings</div></div>
<div class="score"><div class="lbl">After</div><div class="val down">${after.total}</div><div class="sub">findings</div></div>
<div class="score"><div class="lbl">Treated</div><div class="val">${fixed + falsePositives + noDefect}</div><div class="sub">${fixed} fixed, ${falsePositives} false positive, ${noDefect} no defect</div></div>
</div>

<table>
<thead><tr><th>Severity</th><th class="num">Before</th><th class="num">After</th><th class="num">Change</th></tr></thead>
<tbody>${severityRows(before, after)}
<tr><th>Total</th><th class="num">${before.total}</th><th class="num">${after.total}</th><th class="num">${after.total < before.total ? `<span class="down">-${before.total - after.total}</span>` : after.total === before.total ? '=' : `+${after.total - before.total}`}</th></tr>
</tbody></table>

<h3>Tools executed</h3>
<table>
<thead><tr><th>Tool</th><th>Type</th><th class="num">Findings before</th><th class="num">Findings after</th></tr></thead>
<tbody>${scannerRows}</tbody></table>

<p>SCA reads the dependencies against public advisory databases. SAST applies security rules to
the source without running it. DAST exercises the running application over HTTP. The dynamic scan
was authenticated, with an administrative account the tool creates itself, so it reaches the
protected routes instead of being answered 401 on all of them.</p>

<h2 class="pagebreak">2. Findings and treatment</h2>

<p>The ${before.total} findings of the first run, what was established about each one and what
was done about it.</p>

${all.map((finding) => itemCard(finding, resolutions)).join('\n')}

<h2>3. What changed in the system</h2>

<p>The fixes that changed code or configuration in the project:</p>

<ul>
<li><strong>Vulnerable dependency upgraded.</strong> <code>@faker-js/faker</code> from 9.9.0 to
10.6.0, closing the arbitrary code execution in <code>helpers.fake</code>.</li>
<li><strong>Patched version forced on a transitive dependency.</strong> <code>qs</code> raised to
6.16.0 through <code>overrides</code>, since neither <code>express</code> nor
<code>supertest</code> had published a release carrying the fix.</li>
<li><strong>Cache directive on the responses.</strong> A middleware now sets
<code>Cache-Control: no-store</code> and <code>Pragma: no-cache</code> on every response. The API
returns documents, addresses and phone numbers, and with no directive each intermediate cache
decided for itself whether to store them, which is the weakness CWE-524 describes.</li>
<li><strong>Input validation on two list routes.</strong> Four routes answered 500 to a NUL byte
in a query filter, because PostgreSQL cannot compare <code>\0</code> inside a text value, and one
route took a raw string into a uuid column. Both now answer 400 before reaching a query.</li>
<li><strong>Documented suppression of a false positive.</strong> The CVE attributed to the
<code>validator</code> package belongs to a different product of the same name, and the analysis
that supports that conclusion is recorded in the suppression file.</li>
<li><strong>Scan configuration fixed.</strong> The logout routes were removed from the dynamic
scan definition, because the scanner itself called them and revoked the very token it was
authenticated with.</li>
</ul>

<h2>4. Methodology and limitations</h2>

<p>Both runs used <code>npm run security:scan</code>, the same target and the same tool
versions, pinned by image tag. The numbers come from the tool's technical report, frozen into
snapshot files before and after the fixes; this document is generated from those.</p>

<div class="note">A scanner that does not run is never presented as an absence of
vulnerabilities. Both runs had all four tools produce results, which the table above records.</div>

<p>Limitations that hold for both runs:</p>

<ul>
<li>Static analysis is rule based. It reports what its rules describe and stays silent about
weaknesses no rule covers.</li>
<li>Dependency analysis is bounded by the advisory databases at the time of the run. A
vulnerability published afterwards is not in it.</li>
<li>The authenticated dynamic scan uses an administrative role. Routes behind permissions that
role does not hold answered 403 and were not exercised.</li>
<li>The application's rate limiter answered 429 to part of the scan traffic, which is the control
working and at the same time a bound on the coverage reached.</li>
<li>There was no manual penetration testing and no business logic review. A single finding was
classified as a false positive, and only because the evidence is in the text of the advisory
itself.</li>
</ul>

<footer>Document generated at ${escapeHtml(new Date().toISOString())} from
security/reports/snapshots/. Baseline run: ${escapeHtml(new Date(before.generatedAt).toISOString())};
run after the fixes: ${escapeHtml(new Date(after.generatedAt).toISOString())}.</footer>

</div>
</body>
</html>`;
}

/**
 * Renders the page to PDF with headless Chrome, which is the only converter this project can
 * count on being present. A missing browser is not a failure: the HTML is the artefact, and the
 * message says how to print it by hand.
 */
function renderPdf(htmlPath: string): string | null {
  const pdfPath = htmlPath.replace(/\.html$/, '.pdf');
  for (const browser of ['google-chrome', 'chromium', 'chromium-browser']) {
    const result = spawnSync(
      browser,
      [
        '--headless',
        '--disable-gpu',
        '--no-sandbox',
        '--no-pdf-header-footer',
        `--print-to-pdf=${pdfPath}`,
        `file://${htmlPath}`,
      ],
      { timeout: 120_000, stdio: 'ignore' },
    );
    if (result.status === 0 && existsSync(pdfPath)) {
      return pdfPath;
    }
  }
  return null;
}

function main(): void {
  const info = JSON.parse(readFileSync(DELIVERABLE_FILE, 'utf8')) as DeliverableInfo;
  const resolutions = JSON.parse(readFileSync(RESOLUTIONS_FILE, 'utf8')) as Record<string, string>;
  const before = readSnapshot('before');
  const after = readSnapshot('after');
  if (!before || !after) {
    throw new Error('Both snapshots are needed. See `npm run security:snapshot`.');
  }
  const comparison = compare(before, after);
  mkdirSync(REPORTS_DIR, { recursive: true });
  const path = join(REPORTS_DIR, 'tech-challenge-entrega.html');
  writeFileSync(path, buildDeliverableHtml(info, before, after, comparison, resolutions), 'utf8');
  process.stdout.write(`Submission document written: ${path.replace(`${PROJECT_ROOT}/`, '')}\n`);

  const pdfPath = renderPdf(path);
  if (pdfPath) {
    process.stdout.write(`PDF: ${pdfPath.replace(`${PROJECT_ROOT}/`, '')}\n`);
  } else {
    process.stdout.write(
      'No headless browser was found to render the PDF. Open the HTML and print it to PDF.\n',
    );
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`\n[ERROR] ${(error as Error).message}\n\n`);
    process.exitCode = 1;
  }
}
