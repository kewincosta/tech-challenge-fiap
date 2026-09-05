import 'dotenv/config';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  Phase,
  Snapshot,
  SnapshotFinding,
  buildSummaryHtml,
  buildSummaryMarkdown,
  compare,
  findingKey,
  readSnapshot,
  writeSnapshot,
} from './summary-report';

/**
 * Two commands around the short report.
 *
 *   npm run security:snapshot before|after   freezes the current full report as that phase
 *   npm run security:summary                 writes the comparison from the two frozen files
 *
 * The snapshot is taken from the machine readable dump the scan leaves behind, so the short
 * report and the technical one always describe the same run.
 */

const PROJECT_ROOT = resolve(__dirname, '..', '..');
const REPORTS_DIR = join(PROJECT_ROOT, 'security', 'reports');
const STATE_FILE = join(REPORTS_DIR, 'raw', 'consolidation.json');

const out = (text: string): void => {
  process.stdout.write(`${text}\n`);
};

interface ConsolidationDump {
  generatedAt: string;
  target: string;
  counts: Record<string, number>;
  total: number;
  scanners: { tool: string; status: string; findings: number; reason: string | null }[];
  findings: Snapshot['findings'];
}

function takeSnapshot(phase: Phase): void {
  if (!existsSync(STATE_FILE)) {
    throw new Error(
      `No scan output found at ${STATE_FILE}. Run \`npm run security:scan\` before taking a snapshot.`,
    );
  }
  const dump = JSON.parse(readFileSync(STATE_FILE, 'utf8')) as ConsolidationDump;
  const path = writeSnapshot({ phase, ...dump });
  out(`Snapshot "${phase}" written from the last scan: ${path.replace(`${PROJECT_ROOT}/`, '')}`);
  out(`  ${dump.total} findings, generated at ${dump.generatedAt}`);
}

const RESOLUTIONS_FILE = join(PROJECT_ROOT, 'security', 'config', 'resolutions.json');

/**
 * Attaches the written resolution to each finding. A finding with no entry stays without one
 * rather than getting a generated sentence: an unexplained fix is worse than an open question.
 */
function applyResolutions(findings: readonly SnapshotFinding[]): void {
  if (!existsSync(RESOLUTIONS_FILE)) {
    return;
  }
  const resolutions = JSON.parse(readFileSync(RESOLUTIONS_FILE, 'utf8')) as Record<
    string,
    { outcome?: string; text?: string }
  >;
  for (const finding of findings) {
    const entry = resolutions[findingKey(finding)];
    if (entry?.text) {
      finding.resolution = entry.text;
    }
  }
}

function writeSummary(): void {
  const before = readSnapshot('before');
  const after = readSnapshot('after');
  if (!before || !after) {
    throw new Error(
      'Both snapshots are needed. Take "before", apply the fixes, scan again, then take "after".',
    );
  }
  const comparison = compare(before, after);
  // What was done about each finding is written by hand: only a person can say that.
  applyResolutions([...comparison.resolved, ...comparison.remaining, ...comparison.introduced]);
  mkdirSync(REPORTS_DIR, { recursive: true });

  const htmlPath = join(REPORTS_DIR, 'security-summary.html');
  writeFileSync(htmlPath, buildSummaryHtml(before, after, comparison), 'utf8');
  const mdPath = join(REPORTS_DIR, 'security-summary.md');
  writeFileSync(mdPath, buildSummaryMarkdown(before, after, comparison), 'utf8');

  out('Short report written:');
  out(`  ${htmlPath.replace(`${PROJECT_ROOT}/`, '')}`);
  out(`  ${mdPath.replace(`${PROJECT_ROOT}/`, '')}`);
  out('');
  out(
    `  ${before.total} findings before, ${after.total} after: ${comparison.resolved.length} resolved, ${comparison.remaining.length} still open, ${comparison.introduced.length} new.`,
  );
}

function main(): void {
  const [command] = process.argv.slice(2);
  if (command === 'before' || command === 'after') {
    takeSnapshot(command);
    return;
  }
  if (command === 'summary' || command === undefined) {
    writeSummary();
    return;
  }
  throw new Error(`Unknown argument "${command}". Use before, after or summary.`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`\n[ERROR] ${(error as Error).message}\n\n`);
  process.exitCode = 1;
}
