import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from './docker';
import { interpolate, jobRuns, type Context, type Status, type Value } from './expressions';
import type { Job, Workflow } from './workflows';

/**
 * Runs the `run:` steps of a workflow job on this machine, the way a runner does, with stand-ins
 * for what would reach AWS, GitHub or a cluster. The stand-ins are `scripts/tool.sh` (Terraform,
 * Helm and kubectl), `aws`, `docker`, `gh` and `sleep`. Each records its arguments and answers from
 * a world the spec describes, so a spec can read what the job asked for and what it printed.
 */

export interface World {
  /** What `terraform output` knows, by output name. */
  outputs: Record<string, string | number>;
  /** What Secrets Manager answers, by secret name. */
  secrets: Record<string, string>;
  /** What kubectl answers for the Service's hostname, one entry for each call and the last one repeated. Null fails. */
  hostnames: Array<string | null>;
  /** What the GitHub API answers for the tip of main. */
  tip: string;
  /** The exit code of every helm call. */
  helmExit?: number;
}

export interface Call {
  tool: string;
  args: string[];
  stdin?: string;
  /** The TF_VAR_* variables the tool was started with. */
  env?: Record<string, string>;
}

export interface StepResult {
  name: string;
  ran: boolean;
  code: number;
  output: string;
}

export interface JobResult {
  steps: StepResult[];
  calls: Call[];
  /** The folder the steps ran in, which stands for the checked-out repository. */
  workspace: string;
  /** What the steps printed, in order. */
  output: string;
  githubOutput: Record<string, string>;
  summary: string;
  failed: boolean;
  /** Removes the folders the run made. */
  dispose: () => void;
}

/** One program serves every stand-in: the wrappers pass its name and the arguments. */
const STUB = `
const fs = require('node:fs');
const path = require('node:path');
const dir = process.env.STUB_DIR;
const world = JSON.parse(fs.readFileSync(path.join(dir, 'world.json'), 'utf8'));
const [, , kind, ...args] = process.argv;
const record = (tool, toolArgs, extra) =>
  fs.appendFileSync(path.join(dir, 'calls.jsonl'), JSON.stringify({ tool, args: toolArgs, ...extra }) + '\\n');
const count = (name) => {
  const file = path.join(dir, name + '.count');
  const value = fs.existsSync(file) ? Number(fs.readFileSync(file, 'utf8')) : 0;
  fs.writeFileSync(file, String(value + 1));
  return value;
};
const fail = (message, code = 1) => {
  process.stderr.write(message + '\\n');
  process.exit(code);
};
const after = (flag) => args[args.indexOf(flag) + 1];

if (kind === 'tool') {
  const [tool, ...rest] = args;
  record(tool, rest, {
    env: Object.fromEntries(Object.entries(process.env).filter(([name]) => name.startsWith('TF_VAR_'))),
  });
  if (tool === 'terraform' && rest.includes('output')) {
    if (rest.includes('-json')) {
      process.stdout.write(JSON.stringify(Object.fromEntries(Object.entries(world.outputs)
        .map(([name, value]) => [name, { sensitive: false, type: typeof value, value }]))));
    } else {
      const name = rest[rest.length - 1];
      if (!(name in world.outputs)) fail('Error: Output "' + name + '" not found.');
      process.stdout.write(String(world.outputs[name]));
    }
  } else if (tool === 'kubectl' && rest[0] === 'get' && rest[1] === 'service') {
    const answer = world.hostnames[Math.min(count('hostnames'), world.hostnames.length - 1)];
    if (answer === null) fail('error: You must be logged in to the server (Unauthorized)');
    process.stdout.write(answer);
  } else if (tool === 'helm') {
    // A tool that prints its arguments is the worst case for a secret that is on the command line.
    process.stdout.write('helm ' + rest.join(' ') + '\\n');
    process.exit(world.helmExit || 0);
  }
} else if (kind === 'aws') {
  record('aws', args);
  if (args[0] === 'secretsmanager') {
    const name = after('--secret-id');
    if (!(name in world.secrets)) fail('An error occurred (ResourceNotFoundException): ' + name, 254);
    process.stdout.write(world.secrets[name] + '\\n');
  } else if (args[0] === 'ecr') {
    process.stdout.write('ecr-token\\n');
  } else if (args[0] === 'eks') {
    fs.writeFileSync(after('--kubeconfig'), 'apiVersion: v1\\nkind: Config\\n');
  }
} else if (kind === 'docker') {
  record('docker', args, args[0] === 'login' ? { stdin: fs.readFileSync(0, 'utf8') } : {});
} else if (kind === 'gh') {
  record('gh', args);
  process.stdout.write(world.tip + '\\n');
} else {
  record(kind, args);
}
`;

function wrapper(kind: string): string {
  return `#!/bin/sh\nexec node "$STUB_DIR/stub.js" ${kind} "$@"\n`;
}

function install(directory: string, world: World): void {
  mkdirSync(join(directory, 'bin'), { recursive: true });
  mkdirSync(join(directory, 'workspace/scripts'), { recursive: true });
  mkdirSync(join(directory, 'runner-temp'), { recursive: true });
  writeFileSync(join(directory, 'stub.js'), STUB);
  writeFileSync(join(directory, 'world.json'), JSON.stringify(world));
  for (const kind of ['aws', 'docker', 'gh', 'sleep']) {
    writeFileSync(join(directory, 'bin', kind), wrapper(kind));
    chmodSync(join(directory, 'bin', kind), 0o755);
  }
  const tool = join(directory, 'workspace/scripts/tool.sh');
  writeFileSync(tool, wrapper('tool'));
  chmodSync(tool, 0o755);
}

function toText(value: Value): string {
  if (value === null) {
    return '';
  }
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function resolve(
  entries: Record<string, unknown> | undefined,
  context: Context,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(entries ?? {}).map(([name, value]) => [
      name,
      toText(interpolate(String(value), context)),
    ]),
  );
}

/** The `NAME=value` lines a step appended to GITHUB_ENV or GITHUB_OUTPUT. */
function assignments(file: string): Record<string, string> {
  if (!existsSync(file)) {
    return {};
  }
  return Object.fromEntries(
    readFileSync(file, 'utf8')
      .split('\n')
      .filter((line) => line.includes('='))
      .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
  );
}

export interface RunOptions {
  /** The `github` context, with the event the workflow started from. */
  github: Record<string, Value>;
  world: World;
  vars?: Record<string, string>;
}

/** Runs the script steps of one job in order. A step with `uses:` is not run. */
export async function runJob(
  workflow: Workflow,
  jobId: string,
  options: RunOptions,
): Promise<JobResult> {
  const job: Job = workflow.jobs[jobId];
  const directory = mkdtempSync(join(tmpdir(), 'workflow-run-'));
  install(directory, options.world);
  const workspace = join(directory, 'workspace');
  const githubEnvFile = join(directory, 'github-env');
  const githubOutputFile = join(directory, 'github-output');
  const summaryFile = join(directory, 'summary');

  const context: Context = {
    github: options.github,
    vars: options.vars ?? {},
    secrets: {},
    env: {},
  };
  let environment: Record<string, string> = {
    ...resolve(workflow.env, context),
    ...resolve(job.env, context),
  };
  const results: StepResult[] = [];
  let status: Status = 'success';
  let output = '';

  for (const [index, step] of job.steps.entries()) {
    const name = step.name ?? `step ${index + 1}`;
    if (step.run === undefined) {
      results.push({ name, ran: false, code: 0, output: '' });
      continue;
    }
    const stepContext = { ...context, env: environment };
    if (!jobRuns(step.if, stepContext, status)) {
      results.push({ name, ran: false, code: 0, output: '' });
      continue;
    }
    const script = join(directory, `step-${index}.sh`);
    writeFileSync(script, step.run);
    const result = await run('bash', ['--noprofile', '--norc', '-eo', 'pipefail', script], {
      cwd: workspace,
      allowFailure: true,
      env: {
        PATH: `${join(directory, 'bin')}:${process.env.PATH ?? ''}`,
        HOME: directory,
        LANG: 'C.UTF-8',
        STUB_DIR: directory,
        RUNNER_TEMP: join(directory, 'runner-temp'),
        GITHUB_WORKSPACE: workspace,
        GITHUB_ENV: githubEnvFile,
        GITHUB_OUTPUT: githubOutputFile,
        GITHUB_STEP_SUMMARY: summaryFile,
        GITHUB_REPOSITORY: toText(options.github.repository ?? ''),
        ...environment,
        ...resolve(step.env, stepContext),
      },
    });
    environment = { ...environment, ...assignments(githubEnvFile) };
    const printed = result.stdout + result.stderr;
    results.push({ name, ran: true, code: result.code, output: printed });
    output += printed;
    if (result.code !== 0) {
      status = 'failure';
    }
  }

  const callsFile = join(directory, 'calls.jsonl');
  return {
    steps: results,
    calls: existsSync(callsFile)
      ? readFileSync(callsFile, 'utf8')
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line) as Call)
      : [],
    workspace,
    output,
    githubOutput: assignments(githubOutputFile),
    summary: existsSync(summaryFile) ? readFileSync(summaryFile, 'utf8') : '',
    failed: status === 'failure',
    dispose: () => rmSync(directory, { recursive: true, force: true }),
  };
}
