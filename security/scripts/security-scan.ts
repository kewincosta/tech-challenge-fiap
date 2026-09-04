import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ConfigError, SecurityConfig, loadConfig } from './config';
import { consolidate } from './consolidate';
import {
  Environment,
  SemgrepRunner,
  inspectEnvironment,
  installSemgrep,
  pullImage,
  resolveSemgrepRunner,
} from './environment';
import { parseJsonOutput, run } from './exec';
import { ScannerResult } from './finding';
import { buildHtmlReport, buildMarkdownReport } from './report';
import {
  DependencyCheckReport,
  TOOL_NAME as DC_TOOL,
  parseDependencyCheck,
} from './scanners/dependency-check';
import { NpmAuditReport, TOOL_NAME as NPM_TOOL, parseNpmAudit } from './scanners/npm-audit';
import {
  SemgrepReport,
  TOOL_NAME as SEMGREP_TOOL,
  parseSemgrep,
  semgrepErrors,
} from './scanners/semgrep';
import { TOOL_NAME as ZAP_TOOL, ZapReport, parseZap } from './scanners/zap';

/**
 * The orchestrator: validate the environment, run whatever can run, consolidate, report.
 *
 * A scanner that cannot run never fails the whole assessment. It records why, and that reason is
 * carried into the report so a missing analysis is never read as a clean one.
 */

const PROJECT_ROOT = resolve(__dirname, '..', '..');
const SECURITY_DIR = join(PROJECT_ROOT, 'security');
const REPORTS_DIR = join(SECURITY_DIR, 'reports');
const RAW_DIR = join(REPORTS_DIR, 'raw');
const CACHE_DIR = join(SECURITY_DIR, '.cache');
/** ZAP writes here. Its own directory, so making it writable by the container touches nothing else. */
const ZAP_OUT_DIR = join(RAW_DIR, 'zap');

const TOTAL_STEPS = 4;

interface Cli {
  install: boolean;
  only: string[];
}

function parseCli(argv: readonly string[]): Cli {
  const only: string[] = [];
  let install = false;
  for (const arg of argv) {
    if (arg === '--install') {
      install = true;
    } else if (arg.startsWith('--only=')) {
      only.push(
        ...arg
          .slice('--only='.length)
          .split(',')
          .map((value) => value.trim().toLowerCase())
          .filter(Boolean),
      );
    }
  }
  return { install, only };
}

const out = (text: string): void => {
  process.stdout.write(`${text}\n`);
};

function step(index: number, label: string): (mark: string, note?: string) => void {
  const dots = '.'.repeat(Math.max(2, 30 - label.length));
  process.stdout.write(`[${index}/${TOTAL_STEPS}] ${label} ${dots} `);
  return (mark, note) => {
    process.stdout.write(`${mark}${note ? ` ${note}` : ''}\n`);
  };
}

function writeRaw(name: string, contents: string): string | null {
  try {
    mkdirSync(RAW_DIR, { recursive: true });
    const path = join(RAW_DIR, name);
    writeFileSync(path, contents, 'utf8');
    return path;
  } catch {
    return null;
  }
}

function skipped(tool: string, reason: string): ScannerResult {
  return { tool, status: 'skipped', reason, findings: [], durationMs: 0, rawOutputPath: null };
}

function failed(tool: string, reason: string, durationMs: number): ScannerResult {
  return { tool, status: 'failed', reason, findings: [], durationMs, rawOutputPath: null };
}

/** True when the target lives on this machine, which is what decides the container's network. */
function isLocalTarget(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0';
  } catch {
    return false;
  }
}

async function runNpmAudit(): Promise<ScannerResult> {
  const startedAt = Date.now();
  try {
    // `npm audit` exits non-zero when it finds anything, which is a result, not a failure. Only
    // unreadable output counts as a failed scanner. `--audit-level=none` keeps the exit code from
    // depending on severity; the JSON is what is read either way.
    const result = await run('npm', ['audit', '--json', '--audit-level=none'], {
      cwd: PROJECT_ROOT,
      timeoutMs: 180_000,
    });
    const duration = Date.now() - startedAt;
    if (result.timedOut) {
      return failed(NPM_TOOL, 'npm audit timed out.', duration);
    }
    const report = parseJsonOutput<NpmAuditReport>(result.stdout);
    if (!report) {
      return failed(
        NPM_TOOL,
        `npm audit produced no readable JSON: ${result.stderr.trim().slice(0, 200) || 'empty output'}`,
        duration,
      );
    }
    return {
      tool: NPM_TOOL,
      status: 'ok',
      reason: null,
      findings: parseNpmAudit(report),
      durationMs: duration,
      rawOutputPath: writeRaw('npm-audit.json', result.stdout),
    };
  } catch (error) {
    return failed(
      NPM_TOOL,
      `npm audit could not be started: ${(error as Error).message}`,
      Date.now() - startedAt,
    );
  }
}

async function runSemgrep(config: SecurityConfig, runner: SemgrepRunner): Promise<ScannerResult> {
  if (runner.kind === 'unavailable') {
    return skipped(SEMGREP_TOOL, `${runner.reason} Install it with: ${runner.instructions[0]}`);
  }
  const startedAt = Date.now();
  const args =
    runner.kind === 'local'
      ? ['--config', config.semgrep.config, '--json', '--quiet', '--no-git-ignore', 'src']
      : [
          'run',
          '--rm',
          '--volume',
          `${PROJECT_ROOT}:/src:ro`,
          '--workdir',
          '/src',
          runner.image,
          'semgrep',
          '--config',
          config.semgrep.config,
          '--json',
          '--quiet',
          '--no-git-ignore',
          'src',
        ];
  const command = runner.kind === 'local' ? 'semgrep' : 'docker';

  try {
    const result = await run(command, args, {
      cwd: PROJECT_ROOT,
      timeoutMs: config.semgrep.timeoutMs,
    });
    const duration = Date.now() - startedAt;
    if (result.timedOut) {
      return failed(SEMGREP_TOOL, 'Semgrep timed out.', duration);
    }
    const report = parseJsonOutput<SemgrepReport>(result.stdout);
    if (!report) {
      return failed(
        SEMGREP_TOOL,
        `Semgrep produced no readable JSON: ${result.stderr.trim().slice(0, 200) || 'empty output'}`,
        duration,
      );
    }
    const errors = semgrepErrors(report);
    return {
      tool: SEMGREP_TOOL,
      status: 'ok',
      reason: errors.length > 0 ? `Completed with ${errors.length} rule error(s).` : null,
      findings: parseSemgrep(report),
      durationMs: duration,
      rawOutputPath: writeRaw('semgrep.json', result.stdout),
    };
  } catch (error) {
    return failed(
      SEMGREP_TOOL,
      `Semgrep could not be started: ${(error as Error).message}`,
      Date.now() - startedAt,
    );
  }
}

async function runDependencyCheck(
  config: SecurityConfig,
  environment: Environment,
): Promise<ScannerResult> {
  if (!environment.docker.available) {
    return skipped(
      DC_TOOL,
      `Docker is required for ${DC_TOOL}. ${environment.docker.detail ?? ''}`.trim(),
    );
  }
  const startedAt = Date.now();
  mkdirSync(join(CACHE_DIR, 'dependency-check'), { recursive: true });
  mkdirSync(RAW_DIR, { recursive: true });

  const apiKey = process.env.NVD_API_KEY?.trim();
  const args = ['run', '--rm'];
  // The image runs as its own uid, which cannot write to a bind mount owned by the host user.
  // Matching the ids is what the OWASP docker instructions do, and without it the NVD cache and
  // the report directory stay empty. Linux only: Docker Desktop maps ownership itself, and
  // forcing a uid there breaks the container instead of fixing it.
  if (process.platform === 'linux') {
    args.push('--user', `${process.getuid?.() ?? 0}:${process.getgid?.() ?? 0}`);
  }
  args.push(
    '--volume',
    `${PROJECT_ROOT}:/src:ro`,
    '--volume',
    `${join(CACHE_DIR, 'dependency-check')}:/usr/share/dependency-check/data`,
    '--volume',
    `${RAW_DIR}:/report`,
    config.dependencyCheck.dockerImage,
    // The lock file, not the whole tree: it is the authoritative dependency list for an npm
    // project, and Dependency-Check's Node Audit Analyzer reads it directly. Scanning /src would
    // walk every file under node_modules for no extra coverage.
    '--scan',
    '/src/package-lock.json',
    '--scan',
    '/src/package.json',
    '--format',
    'JSON',
    '--project',
    'workshop-management-api',
    '--out',
    '/report',
    '--disableAssembly',
  );
  if (apiKey) {
    args.push('--nvdApiKey', apiKey);
  }

  try {
    const result = await run('docker', args, {
      cwd: PROJECT_ROOT,
      timeoutMs: config.dependencyCheck.timeoutMs,
    });
    const duration = Date.now() - startedAt;
    if (result.timedOut) {
      return failed(
        DC_TOOL,
        'Dependency-Check timed out. The first run downloads the NVD database; set NVD_API_KEY to speed it up.',
        duration,
      );
    }
    let report: DependencyCheckReport | null = null;
    try {
      const { readFileSync } = await import('node:fs');
      report = JSON.parse(
        readFileSync(join(RAW_DIR, 'dependency-check-report.json'), 'utf8'),
      ) as DependencyCheckReport;
    } catch {
      report = null;
    }
    if (!report) {
      const hint = apiKey
        ? ''
        : ' No NVD_API_KEY was set, which makes the NVD download slow and rate limited.';
      return failed(
        DC_TOOL,
        `Dependency-Check produced no readable report.${hint} ${result.stderr.trim().slice(0, 200)}`.trim(),
        duration,
      );
    }
    return {
      tool: DC_TOOL,
      status: 'ok',
      reason: null,
      findings: parseDependencyCheck(report),
      durationMs: duration,
      rawOutputPath: join(RAW_DIR, 'dependency-check-report.json'),
    };
  } catch (error) {
    return failed(
      DC_TOOL,
      `Dependency-Check could not be started: ${(error as Error).message}`,
      Date.now() - startedAt,
    );
  }
}

/** True when the application answers, so a scan is not launched against nothing. */
async function targetIsUp(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return response.status > 0;
  } catch {
    return false;
  }
}

async function runZap(config: SecurityConfig, environment: Environment): Promise<ScannerResult> {
  if (!environment.docker.available) {
    return skipped(
      ZAP_TOOL,
      `Docker is required for ${ZAP_TOOL}. ${environment.docker.detail ?? ''}`.trim(),
    );
  }
  const target = config.application.baseUrl;
  if (!(await targetIsUp(target))) {
    return skipped(
      ZAP_TOOL,
      `The application did not answer at ${target}. Start it with \`docker compose up -d\` and run the scan again.`,
    );
  }

  const openapiUrl = config.openapi.url;
  const useApiScan =
    config.zap.mode === 'api' ||
    (config.zap.mode === 'auto' && Boolean(openapiUrl) && (await targetIsUp(openapiUrl!)));

  const startedAt = Date.now();
  const reportName = 'zap-report.json';
  const script = useApiScan ? 'zap-api-scan.py' : 'zap-baseline.py';
  const scanTarget = useApiScan ? (openapiUrl ?? target) : target;

  // Unlike Dependency-Check, ZAP cannot be forced onto the host uid: it needs to write its own
  // home inside the image and refuses to start. The report directory is made writable instead.
  // It is a directory this tool creates, under an ignored path, so nothing else is loosened.
  mkdirSync(ZAP_OUT_DIR, { recursive: true });
  try {
    chmodSync(ZAP_OUT_DIR, 0o777);
  } catch {
    // A filesystem that refuses the mode change will surface as ZAP's own permission error below.
  }
  const dockerArgs = ['run', '--rm', '--volume', `${ZAP_OUT_DIR}:/zap/wrk:rw`];
  if (isLocalTarget(target)) {
    // The container has to reach a service on the host. host networking is the portable answer on
    // Linux, which is where this is expected to run; on Docker Desktop, point baseUrl at
    // host.docker.internal instead.
    dockerArgs.push('--network', 'host');
  }
  dockerArgs.push(
    config.zap.dockerImage,
    script,
    '-t',
    scanTarget,
    '-J',
    reportName,
    '-I', // do not fail the process on warnings; the findings are read from the report
  );
  if (useApiScan) {
    dockerArgs.push('-f', 'openapi');
  }

  try {
    const result = await run('docker', dockerArgs, {
      cwd: PROJECT_ROOT,
      timeoutMs: config.zap.timeoutMs,
    });
    const duration = Date.now() - startedAt;
    if (result.timedOut) {
      return failed(ZAP_TOOL, 'ZAP timed out.', duration);
    }
    let report: ZapReport | null = null;
    try {
      const { readFileSync } = await import('node:fs');
      report = JSON.parse(readFileSync(join(ZAP_OUT_DIR, reportName), 'utf8')) as ZapReport;
    } catch {
      report = null;
    }
    if (!report) {
      return failed(
        ZAP_TOOL,
        `ZAP produced no readable report: ${result.stderr.trim().slice(0, 200) || result.stdout.trim().slice(-200) || 'empty output'}`,
        duration,
      );
    }
    return {
      tool: ZAP_TOOL,
      status: 'ok',
      reason: useApiScan ? 'API scan, driven by the OpenAPI definition.' : 'Baseline scan.',
      findings: parseZap(report),
      durationMs: duration,
      rawOutputPath: join(ZAP_OUT_DIR, reportName),
    };
  } catch (error) {
    return failed(
      ZAP_TOOL,
      `ZAP could not be started: ${(error as Error).message}`,
      Date.now() - startedAt,
    );
  }
}

/** Only what actually happened during this run, never a boilerplate list. */
function buildLimitations(
  results: readonly ScannerResult[],
  usedApiScan: boolean,
  zapRan: boolean,
): string[] {
  const limitations: string[] = [];
  for (const result of results) {
    if (result.status !== 'ok') {
      limitations.push(
        `${result.tool} did not produce results (${statusText(result)}): ${result.reason ?? 'no reason recorded'}. Its analysis is absent from this report and must not be read as an absence of findings.`,
      );
    }
  }
  if (zapRan) {
    limitations.push(
      'The dynamic scan ran without credentials. Every route behind the JWT guard answered 401 and was therefore not exercised, so authenticated behaviour is untested.',
    );
    if (usedApiScan) {
      limitations.push(
        'The dynamic scan was driven by the OpenAPI definition, so it reached the documented routes only. Anything not described there was not requested.',
      );
    } else {
      limitations.push(
        'The dynamic scan was a baseline crawl. An API that returns JSON offers few links to follow, so coverage is limited to what the crawler reached from the base URL.',
      );
    }
  }
  limitations.push(
    'Static analysis is rule based. It reports what its rules match and stays silent about weaknesses no rule describes.',
  );
  limitations.push(
    'Dependency analysis is bounded by the advisory databases at the time of the run. A vulnerability published after this scan is not in it.',
  );
  limitations.push(
    'No manual penetration testing, business logic review or code review was performed. Findings are classified as confirmed or potential; none has been dismissed as a false positive, which would require a human review this tool does not perform.',
  );
  return limitations;
}

function statusText(result: ScannerResult): string {
  return result.status === 'skipped' ? 'not executed' : 'failed';
}

async function main(): Promise<void> {
  const cli = parseCli(process.argv.slice(2));
  const config = loadConfig(join(SECURITY_DIR, 'security.config.json'));

  out('');
  out('Security Assessment');
  out('────────────────────────────────────');
  out('');

  out('[Security] Checking dependencies...');
  out('');
  const environment = await inspectEnvironment();
  for (const tool of [environment.node, environment.npm, environment.docker, environment.semgrep]) {
    const mark = tool.available ? '✓' : '✗';
    out(`  ${mark} ${tool.name}${tool.version ? ` (${tool.version})` : ''}`);
    if (!tool.available && tool.detail) {
      out(`      ${tool.detail}`);
    }
  }
  out('');

  if (!environment.node.available) {
    throw new Error(environment.node.detail ?? 'Unsupported Node.js version.');
  }
  if (!environment.npm.available) {
    throw new Error('npm is required to run this assessment.');
  }

  let semgrepRunner = resolveSemgrepRunner(environment, config.semgrep.dockerImage);
  if (semgrepRunner.kind === 'docker') {
    out('  Semgrep is not installed locally; it will run from a pinned container image.');
  }
  if (semgrepRunner.kind === 'unavailable' && cli.install) {
    out('  Installing Semgrep...');
    const outcome = await installSemgrep();
    out(`  ${outcome.installed ? '✓' : '✗'} ${outcome.message}`);
    if (outcome.installed) {
      semgrepRunner = { kind: 'local' };
    }
  } else if (semgrepRunner.kind === 'unavailable') {
    out('  Semgrep is unavailable. Re-run with --install, or install it manually:');
    for (const instruction of semgrepRunner.instructions) {
      out(`      ${instruction}`);
    }
  }
  out('');

  const enabled = (name: string, flag: boolean): boolean =>
    flag && (cli.only.length === 0 || cli.only.includes(name));

  /** Says which of the two reasons kept a scanner from running, so the report is not misleading. */
  const disabledReason = (name: string, flag: boolean): string =>
    !flag
      ? 'Disabled in security.config.json.'
      : `Not selected by --only=${cli.only.join(',')}. This run is deliberately partial.`;

  if (environment.docker.available) {
    const images: string[] = [];
    if (enabled('dependencycheck', config.scanners.dependencyCheck)) {
      images.push(config.dependencyCheck.dockerImage);
    }
    if (enabled('zap', config.scanners.zap)) {
      images.push(config.zap.dockerImage);
    }
    if (semgrepRunner.kind === 'docker' && enabled('semgrep', config.scanners.semgrep)) {
      images.push(semgrepRunner.image);
    }
    for (const image of images) {
      process.stdout.write(`  Pulling ${image} ... `);
      out((await pullImage(image)) ? '✓' : '✗ (will use a local copy if one exists)');
    }
    if (images.length > 0) out('');
  }

  const results: ScannerResult[] = [];

  const finishAudit = step(1, 'npm audit');
  const auditResult = enabled('npmaudit', config.scanners.npmAudit)
    ? await runNpmAudit()
    : skipped(NPM_TOOL, disabledReason('npmaudit', config.scanners.npmAudit));
  results.push(auditResult);
  finishAudit(auditResult.status === 'ok' ? '✓' : '✗', auditResult.reason ?? undefined);

  const finishSemgrep = step(2, 'Semgrep');
  const semgrepResult = enabled('semgrep', config.scanners.semgrep)
    ? await runSemgrep(config, semgrepRunner)
    : skipped(SEMGREP_TOOL, disabledReason('semgrep', config.scanners.semgrep));
  results.push(semgrepResult);
  finishSemgrep(semgrepResult.status === 'ok' ? '✓' : '✗', semgrepResult.reason ?? undefined);

  const finishDc = step(3, 'Dependency-Check');
  const dcResult = enabled('dependencycheck', config.scanners.dependencyCheck)
    ? await runDependencyCheck(config, environment)
    : skipped(DC_TOOL, disabledReason('dependencycheck', config.scanners.dependencyCheck));
  results.push(dcResult);
  finishDc(dcResult.status === 'ok' ? '✓' : '✗', dcResult.reason ?? undefined);

  const finishZap = step(4, 'OWASP ZAP');
  const zapResult = enabled('zap', config.scanners.zap)
    ? await runZap(config, environment)
    : skipped(ZAP_TOOL, disabledReason('zap', config.scanners.zap));
  results.push(zapResult);
  finishZap(zapResult.status === 'ok' ? '✓' : '✗', zapResult.reason ?? undefined);

  out('');
  process.stdout.write('Generating report ............... ');

  const consolidation = consolidate(results);
  const context = {
    config,
    consolidation,
    results,
    generatedAt: new Date(),
    target: config.application.baseUrl,
    limitations: buildLimitations(
      results,
      zapResult.reason?.startsWith('API scan') ?? false,
      zapResult.status === 'ok',
    ),
    toolVersions: [
      { name: NPM_TOOL, version: environment.npm.version },
      {
        name: SEMGREP_TOOL,
        version:
          environment.semgrep.version ??
          (semgrepRunner.kind === 'docker' ? semgrepRunner.image : null),
      },
      { name: DC_TOOL, version: config.dependencyCheck.dockerImage },
      { name: ZAP_TOOL, version: config.zap.dockerImage },
    ],
  };

  mkdirSync(REPORTS_DIR, { recursive: true });
  const htmlPath = join(REPORTS_DIR, 'security-report.html');
  writeFileSync(htmlPath, buildHtmlReport(context), 'utf8');
  let markdownPath: string | null = null;
  if (config.report.markdown) {
    markdownPath = join(REPORTS_DIR, 'security-report.md');
    writeFileSync(markdownPath, buildMarkdownReport(context), 'utf8');
  }
  out('✓');

  out('');
  out(
    `Findings: ${consolidation.total} (critical ${consolidation.counts.critical}, high ${consolidation.counts.high}, medium ${consolidation.counts.medium}, low ${consolidation.counts.low}, informational ${consolidation.counts.informational})`,
  );
  out('');
  out('Report:');
  out(`  ${htmlPath.replace(`${PROJECT_ROOT}/`, '')}`);
  if (markdownPath) {
    out(`  ${markdownPath.replace(`${PROJECT_ROOT}/`, '')}`);
  }
  out('');

  // The exit code reports whether the assessment ran, not whether it found anything. A run that
  // failed the build on findings would push people to disable it.
  if (consolidation.failedScanners.length > 0) {
    out(
      `Note: ${consolidation.failedScanners.length} scanner(s) failed. See the Limitations section of the report.`,
    );
  }
}

main().catch((error: unknown) => {
  if (error instanceof ConfigError) {
    process.stderr.write(`\n[ERROR] ${error.message}\n\n`);
  } else {
    process.stderr.write(`\n[ERROR] ${(error as Error).message}\n\n`);
  }
  process.exitCode = 1;
});
