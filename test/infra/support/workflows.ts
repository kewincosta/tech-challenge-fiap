import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { REPOSITORY_ROOT } from './docker';

export const WORKFLOWS_FOLDER = join(REPOSITORY_ROOT, '.github/workflows');

export interface Step {
  id?: string;
  name?: string;
  uses?: string;
  run?: string;
  if?: string;
  with?: Record<string, unknown>;
  env?: Record<string, string>;
  shell?: string;
  'continue-on-error'?: boolean | string;
}

export interface Job {
  name?: string;
  needs?: string | string[];
  if?: string;
  environment?: string | { name?: string };
  permissions?: Record<string, string> | string;
  'runs-on'?: string;
  'timeout-minutes'?: number;
  'continue-on-error'?: boolean | string;
  outputs?: Record<string, string>;
  env?: Record<string, string>;
  concurrency?: unknown;
  steps: Step[];
}

export interface Workflow {
  name: string;
  on: string | string[] | Record<string, Record<string, unknown> | null>;
  permissions?: Record<string, string> | string;
  concurrency?: string | { group: string; 'cancel-in-progress'?: boolean | string };
  env?: Record<string, string>;
  defaults?: { run?: { shell?: string } };
  jobs: Record<string, Job>;
}

export function workflowFiles(): string[] {
  return readdirSync(WORKFLOWS_FOLDER)
    .filter((file) => /\.ya?ml$/.test(file))
    .sort();
}

export function workflowText(file: string): string {
  return readFileSync(join(WORKFLOWS_FOLDER, file), 'utf8');
}

export function readWorkflow(file: string): Workflow {
  return parse(workflowText(file)) as Workflow;
}

/** The triggers of a workflow by name, whether the file wrote `on` as a name, a list or a map. */
export function triggersOf(workflow: Workflow): Record<string, Record<string, unknown>> {
  const written = workflow.on;
  if (typeof written === 'string') {
    return { [written]: {} };
  }
  if (Array.isArray(written)) {
    return Object.fromEntries(written.map((name) => [name, {}]));
  }
  return Object.fromEntries(
    Object.entries(written).map(([name, filters]) => [name, filters ?? {}]),
  );
}

export function needsOf(job: Job): string[] {
  if (job.needs === undefined) {
    return [];
  }
  return Array.isArray(job.needs) ? job.needs : [job.needs];
}

/** Every job the job waits for, directly or through the jobs it waits for. */
export function ancestorsOf(workflow: Workflow, jobId: string): string[] {
  const found = new Set<string>();
  const visit = (id: string): void => {
    for (const parent of needsOf(workflow.jobs[id])) {
      if (!found.has(parent)) {
        found.add(parent);
        visit(parent);
      }
    }
  };
  visit(jobId);
  return [...found];
}

export function environmentOf(job: Job): string | undefined {
  return typeof job.environment === 'string' ? job.environment : job.environment?.name;
}

/** The permissions a job holds: its own when it sets any, otherwise the workflow's. */
export function permissionsOf(workflow: Workflow, job: Job): Record<string, string> {
  const written = job.permissions ?? workflow.permissions ?? {};
  return typeof written === 'string' ? { 'all-scopes': written } : written;
}

/** The lines of a script that run something: continuations joined, comments and blank lines gone. */
export function logicalLines(script: string): string[] {
  const lines: string[] = [];
  let pending = '';
  for (const raw of script.split('\n')) {
    const line = raw.trim();
    if (pending === '' && (line === '' || line.startsWith('#'))) {
      continue;
    }
    if (line.endsWith('\\')) {
      pending += `${line.slice(0, -1).trim()} `;
    } else {
      lines.push(`${pending}${line}`.trim());
      pending = '';
    }
  }
  return lines;
}

/** The words of a command line, quotes removed, as the shell would split it. */
export function wordsOf(line: string): string[] {
  const words: string[] = [];
  let current: string | undefined;
  let quote: string | undefined;
  for (const character of line) {
    if (quote !== undefined) {
      if (character === quote) {
        quote = undefined;
      } else {
        current += character;
      }
    } else if (character === '"' || character === "'") {
      quote = character;
      current ??= '';
    } else if (/\s/.test(character)) {
      if (current !== undefined) {
        words.push(current);
        current = undefined;
      }
    } else {
      current = (current ?? '') + character;
    }
  }
  if (current !== undefined) {
    words.push(current);
  }
  return words;
}

/** The steps of a job that run a script. */
export function scriptSteps(job: Job): Array<Step & { run: string }> {
  return job.steps.filter((step): step is Step & { run: string } => step.run !== undefined);
}

/** The steps of a job that call an action. */
export function actionSteps(job: Job): Array<Step & { uses: string }> {
  return job.steps.filter((step): step is Step & { uses: string } => step.uses !== undefined);
}
