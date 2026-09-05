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

/** The figures section 1 prints. Kept in the config file so the document never invents one. */
export interface ProjectStats {
  modules: number;
  httpOperations: number;
  tables: number;
  migrations: number;
  adrs: number;
  unitTests: number;
  integrationTests: number;
  e2eTests: number;
}

export interface DeliverableInfo {
  group: string;
  course: string;
  projectName: string;
  participants: Participant[];
  documentationUrl: string;
  repositoryUrl: string;
  stats: ProjectStats;
}

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'informational'] as const;

const SEVERITY_LABEL: Record<string, string> = {
  critical: 'Crítica',
  high: 'Alta',
  medium: 'Média',
  low: 'Baixa',
  informational: 'Informativa',
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

export type Outcome = 'fixed' | 'false-positive' | 'no-defect' | 'open';

/** What was written by hand about one finding: the verdict, and the prose that supports it. */
export interface Resolution {
  outcome: Outcome;
  text: string;
}

const OUTCOMES: readonly Outcome[] = ['fixed', 'false-positive', 'no-defect', 'open'];

/**
 * The verdict is stated in the entry, never inferred from the prose.
 *
 * An earlier version read it from the first words of the text, which coupled the status of every
 * finding to the language the text happened to be written in: translating the file would have
 * silently reported every finding as open. A finding with no entry is open, which is the honest
 * default for something nobody has written about.
 */
export function outcomeOf(resolution: Resolution | undefined): Outcome {
  if (!resolution || !OUTCOMES.includes(resolution.outcome)) {
    return 'open';
  }
  return resolution.outcome;
}

const OUTCOME_LABEL: Record<ReturnType<typeof outcomeOf>, string> = {
  fixed: 'Corrigido',
  'false-positive': 'Falso positivo',
  'no-defect': 'Sem defeito',
  open: 'Em aberto',
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

function itemCard(finding: SnapshotFinding, resolutions: Record<string, Resolution>): string {
  const resolution = resolutions[findingKey(finding)];
  const outcome = outcomeOf(resolution);
  const identifiers = [...finding.cve, ...finding.cwe].join(', ');
  const meta = [
    `Severidade: ${severityLabel(finding.severity)}`,
    `Ferramenta: ${finding.tools.join(', ')}`,
    `OWASP: ${finding.owasp ?? 'não determinado'}`,
    identifiers ? `Identificadores: ${identifiers}` : null,
    finding.location ? `Local: ${finding.location}` : null,
  ]
    .filter(Boolean)
    .join(' &middot; ');

  return `<div class="item ${outcome}">
<h3>${escapeHtml(finding.title)} <span class="pill ${outcome}">${OUTCOME_LABEL[outcome]}</span></h3>
<p class="meta">${meta}</p>
<p>${escapeHtml(resolution?.text ?? 'Sem tratamento registrado.')}</p>
</div>`;
}

export function buildDeliverableHtml(
  info: DeliverableInfo,
  before: Snapshot,
  after: Snapshot,
  comparison: Comparison,
  resolutions: Record<string, Resolution>,
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
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Tech Challenge - Grupo ${escapeHtml(info.group)}</title>
<style>${STYLES}</style>
</head>
<body>
<div class="page">

<div class="cover">
<p class="kicker">${escapeHtml(info.course)}</p>
<h1>Documento de entrega</h1>
<p class="lead">${escapeHtml(info.projectName)}</p>
</div>

<dl class="ident">
<dt>Grupo</dt><dd>${escapeHtml(info.group)}</dd>
<dt>Participantes</dt><dd>${info.participants
    .map((p) => `${escapeHtml(p.name)} (Discord: ${escapeHtml(p.discord)})`)
    .join('<br>')}</dd>
<dt>Documentação</dt><dd><a href="${escapeHtml(info.documentationUrl)}">${escapeHtml(info.documentationUrl)}</a></dd>
<dt>Repositório</dt><dd><a href="${escapeHtml(info.repositoryUrl)}">${escapeHtml(info.repositoryUrl)}</a></dd>
</dl>

<h2>1. O que foi construído</h2>

<p>Uma API REST para a operação de uma oficina mecânica, do momento em que o veículo chega ao
momento em que é devolvido. O sistema gira em torno de um conceito, a <strong>ordem de
serviço</strong>: quem é o cliente, qual o veículo, o que foi diagnosticado, quanto custa, quem
aprovou, quais peças saíram do estoque e quando o carro foi entregue.</p>

<p>A arquitetura é um monolito modular com CQRS, em um processo e um banco. Cada módulo tem quatro
camadas, e a fronteira entre eles é real: nenhum módulo importa o repositório ou a entidade do
vizinho, e a comunicação passa por barramentos de comando e consulta. Isso não é convenção de
nome de pasta, e sim regra do ESLint: framework não entra em <code>domain</code>, infraestrutura
não entra em <code>application</code>, e a violação quebra o lint.</p>

<table>
<thead><tr><th>Item</th><th class="num">Quantidade</th></tr></thead>
<tbody>
<tr><td>Módulos</td><td class="num">${info.stats.modules}</td></tr>
<tr><td>Operações HTTP</td><td class="num">${info.stats.httpOperations}</td></tr>
<tr><td>Tabelas de domínio</td><td class="num">${info.stats.tables}</td></tr>
<tr><td>Migrations escritas à mão</td><td class="num">${info.stats.migrations}</td></tr>
<tr><td>Registros de decisão de arquitetura</td><td class="num">${info.stats.adrs}</td></tr>
<tr><td>Testes automatizados</td><td class="num">${info.stats.unitTests} unitários, ${info.stats.integrationTests} de integração, ${info.stats.e2eTests} e2e</td></tr>
</tbody></table>

<p>O banco é PostgreSQL, e a justificativa está registrada por inteiro na ADR 0002 do repositório.
O argumento central: a retirada de peça baixa o estoque, grava um movimento no livro-razão e
atualiza a ordem de serviço; se qualquer parte falhar, as três precisam falhar juntas. Além disso,
a exclusão lógica do projeto depende de índice único parcial, que o PostgreSQL suporta
nativamente.</p>

<h2 class="pagebreak">2. Análise de vulnerabilidades</h2>

<p>O sistema foi submetido a uma análise automatizada de segurança com quatro ferramentas
reconhecidas pela OWASP, cobrindo os três ângulos que se complementam: as dependências declaradas,
o código-fonte e a aplicação em execução. A análise foi executada duas vezes, antes e depois das
correções, com o mesmo comando e contra o mesmo alvo.</p>

<div class="scoreboard">
<div class="score"><div class="lbl">Antes</div><div class="val">${before.total}</div><div class="sub">achados</div></div>
<div class="score"><div class="lbl">Depois</div><div class="val down">${after.total}</div><div class="sub">achados</div></div>
<div class="score"><div class="lbl">Tratados</div><div class="val">${fixed + falsePositives + noDefect}</div><div class="sub">${fixed} corrigidos, ${falsePositives} falso positivo, ${noDefect} sem defeito</div></div>
</div>

<table>
<thead><tr><th>Severidade</th><th class="num">Antes</th><th class="num">Depois</th><th class="num">Variação</th></tr></thead>
<tbody>${severityRows(before, after)}
<tr><th>Total</th><th class="num">${before.total}</th><th class="num">${after.total}</th><th class="num">${after.total < before.total ? `<span class="down">-${before.total - after.total}</span>` : after.total === before.total ? '=' : `+${after.total - before.total}`}</th></tr>
</tbody></table>

<h3>2.1 Ferramentas executadas</h3>
<table>
<thead><tr><th>Ferramenta</th><th>Tipo</th><th class="num">Achados antes</th><th class="num">Achados depois</th></tr></thead>
<tbody>${scannerRows}</tbody></table>

<p>SCA analisa as dependências contra bases públicas de advisories. SAST aplica regras de
segurança sobre o código sem executá-lo. DAST exercita a aplicação em execução por HTTP. A
varredura dinâmica foi feita autenticada, com uma conta de papel administrativo criada pela
própria ferramenta, para alcançar as rotas protegidas em vez de receber 401 em todas.</p>

<h3 class="pagebreak">2.2 Achados e tratamento</h3>

<p>Os ${before.total} achados da primeira execução, o que foi apurado sobre cada um e o que foi
feito a respeito.</p>

${all.map((finding) => itemCard(finding, resolutions)).join('\n')}

<h3>2.3 O que mudou no sistema</h3>

<p>As correções que alteraram código ou configuração do projeto:</p>

<ul>
<li><strong>Dependência vulnerável atualizada.</strong> <code>@faker-js/faker</code> de 9.9.0 para
10.6.0, fechando a execução arbitrária de código em <code>helpers.fake</code>.</li>
<li><strong>Versão corrigida forçada em dependência transitiva.</strong> <code>qs</code> elevado a
6.16.0 por <code>overrides</code>, já que nem <code>express</code> nem <code>supertest</code>
haviam publicado release com a correção.</li>
<li><strong>Diretiva de cache nas respostas.</strong> Um middleware passou a definir
<code>Cache-Control: no-store</code> e <code>Pragma: no-cache</code> em toda resposta. A API
devolve CPF, endereço e telefone, e sem diretiva cada cache intermediário decidia sozinho se
guardava, que é a fraqueza descrita no CWE-524.</li>
<li><strong>Validação de entrada em rotas de listagem.</strong> Quatro rotas respondiam 500 a um
byte nulo em filtro, porque o PostgreSQL não compara <code>\\0</code> dentro de texto, e uma rota
recebia string crua em coluna uuid. As duas agora respondem 400 antes de qualquer consulta.</li>
<li><strong>Supressão documentada de falso positivo.</strong> O CVE atribuído ao pacote
<code>validator</code> pertence a outro produto de mesmo nome, e a análise que sustenta essa
conclusão está registrada no arquivo de supressões.</li>
<li><strong>Correção na configuração da varredura.</strong> As rotas de logout foram removidas da
especificação que dirige o scan, porque o próprio scanner as chamava e revogava o token com que
estava autenticado.</li>
</ul>

<h3>2.4 Metodologia e limitações</h3>

<p>As duas execuções usaram <code>npm run security:scan</code>, o mesmo alvo e as mesmas versões
de ferramenta, fixadas por tag de imagem. Os números vieram do relatório técnico da ferramenta,
congelado em arquivos de snapshot antes e depois das correções; este documento é gerado a partir
deles.</p>

<div class="note">Um scanner que não roda nunca é apresentado como ausência de vulnerabilidade. As
duas execuções tiveram as quatro ferramentas com resultado, o que está registrado na tabela
acima.</div>

<p>Limitações que valem para as duas execuções:</p>

<ul>
<li>A análise estática é baseada em regras. Ela reporta o que suas regras descrevem e é silenciosa
sobre fraquezas que nenhuma regra cobre.</li>
<li>A análise de dependências é limitada pelas bases de advisories no momento da execução. Uma
vulnerabilidade publicada depois não está nela.</li>
<li>A varredura dinâmica autenticada usa um papel administrativo. Rotas atrás de permissões que
esse papel não tem responderam 403 e não foram exercitadas.</li>
<li>O limitador de requisições da aplicação respondeu 429 a parte das requisições da varredura, o
que é o controle funcionando e ao mesmo tempo limita a cobertura alcançada.</li>
<li>Não houve teste de intrusão manual nem revisão de lógica de negócio. Um único achado foi
classificado como falso positivo, e apenas porque a evidência está no texto do próprio advisory.</li>
</ul>

<h2>3. Onde encontrar o resto</h2>

<p>O repositório carrega a documentação completa em inglês: o <code>README.md</code> com a
arquitetura, a stack e o passo a passo de execução; <code>docs/adr/</code> com os
${info.stats.adrs} registros de decisão; <code>docs/architecture/</code> com o projeto de alto e
baixo nível por módulo; <code>docs/ubiquitous-language/</code> com o vocabulário de cada contexto
delimitado; e <code>security/README.md</code> com a metodologia completa desta análise.</p>

<footer>Documento gerado em ${escapeHtml(new Date().toISOString())} a partir de
security/reports/snapshots/. Execução base: ${escapeHtml(new Date(before.generatedAt).toISOString())};
execução após as correções: ${escapeHtml(new Date(after.generatedAt).toISOString())}.</footer>

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
  const resolutions = JSON.parse(readFileSync(RESOLUTIONS_FILE, 'utf8')) as Record<
    string,
    Resolution
  >;
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
