import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseAllDocuments } from 'yaml';
import { validateEnv } from '../../../src/config/env.validation';
import { REPOSITORY_ROOT, run } from '../support/docker';
import {
  hasStatusFunction,
  interpolate,
  jobRuns,
  toText,
  type Context,
  type Value,
} from '../support/expressions';
import { blockArguments, blocks, readText, unquoted, withoutComments } from '../support/hcl';
import { runJob, type Call, type JobResult, type World } from '../support/runner';
import {
  actionSteps,
  ancestorsOf,
  environmentOf,
  logicalLines,
  needsOf,
  permissionsOf,
  readWorkflow,
  scriptSteps,
  triggersOf,
  workflowFiles,
  workflowText,
  type Job,
  type Workflow,
} from '../support/workflows';

const REPOSITORY = 'owner/repo';
const COMMIT = '5d0c7e1f4a2b9c3d8e6f0a1b2c3d4e5f60718293';
const NEWER_COMMIT = '9a8b7c6d5e4f30211203f4e5d6c7b8a998877665';
const CHART = join(REPOSITORY_ROOT, 'k8s/workshop');
const NO_FAILURE = [undefined, false, 'false'];

const ci = readWorkflow('ci.yml');
const cd = readWorkflow('cd.yml');

/** The values the deploy passes to the chart, which `k8s/README.md` lists. */
const DEPLOY_KEYS = [
  'config.APP_PUBLIC_URL',
  'config.DATABASE_HOST',
  'config.DATABASE_NAME',
  'config.DATABASE_PORT',
  'config.DATABASE_USER',
  'config.REDIS_HOST',
  'config.REDIS_PORT',
  'image.repository',
  'image.tag',
  'secrets.DATABASE_PASSWORD',
  'secrets.JWT_SECRET',
];

/** What Terraform knows. The values differ from prod's, so a script that guesses one fails. */
const OUTPUTS: Record<string, string | number> = {
  region: 'us-east-1',
  cluster_name: 'stack-cluster',
  repository_url: 'registry.example.test/workshop-prod',
  database_host: 'db.internal.example.test',
  database_port: 6543,
  database_name: 'appdb',
  database_user: 'appuser',
  redis_host: 'cache.internal.example.test',
  redis_port: 6380,
  database_password_secret_name: 'stack/db-secret',
  jwt_secret_name: 'stack/signing-secret',
};

const DATABASE_PASSWORD = 'Zp4w8s7Qe1Lm0Xc3Vb5N9a2Kd6Rt8Yh1';
const JWT_SECRET = '5f0c2b7e9d4a1c8f3b6e0a7d2c9f4b1e8a5d3c0f7b2e9a6d1c4f8b3e0a7d5c2f';
const SECRETS: Record<string, string> = {
  'stack/db-secret': DATABASE_PASSWORD,
  'stack/signing-secret': JWT_SECRET,
};

/** A completed run of the CI, as the `workflow_run` event describes it. */
interface CiRun {
  conclusion: string;
  event: string;
  head_branch: string;
  head_sha: string;
  head_repository: { full_name: string };
}

function ciRun(
  conclusion: string,
  event: string,
  branch: string,
  options: { repository?: string; sha?: string } = {},
): CiRun {
  return {
    conclusion,
    event,
    head_branch: branch,
    head_sha: options.sha ?? COMMIT,
    head_repository: { full_name: options.repository ?? REPOSITORY },
  };
}

const PASSED = ciRun('success', 'push', 'main');

/** What the CD does for each kind of CI run: nothing, unless it is a push to main that passed. */
const EXAMPLES: Array<[string, CiRun, boolean]> = [
  ['a push to main that passed', PASSED, true],
  [
    'a later push to main that passed',
    ciRun('success', 'push', 'main', { sha: NEWER_COMMIT }),
    true,
  ],
  ['a push to main that failed', ciRun('failure', 'push', 'main'), false],
  ['a push to main that was cancelled', ciRun('cancelled', 'push', 'main'), false],
  ['a push to main that timed out', ciRun('timed_out', 'push', 'main'), false],
  ['a push to main that was skipped', ciRun('skipped', 'push', 'main'), false],
  ["a pull request's run from a branch", ciRun('success', 'pull_request', 'feature'), false],
  [
    "a pull request's run from a fork whose branch is named main",
    ciRun('success', 'pull_request', 'main', { repository: 'stranger/fork' }),
    false,
  ],
  [
    "a pull request's run from a branch of this repository named main",
    ciRun('success', 'pull_request', 'main'),
    false,
  ],
  ["another branch's run", ciRun('success', 'push', 'feature'), false],
  ["a tag's run", ciRun('success', 'push', 'v1.0.0'), false],
  ["a fork's run", ciRun('success', 'push', 'main', { repository: 'stranger/fork' }), false],
];

/** The `github` context of a CD run that a CI run started. `sha` is the tip of main, as GitHub sets it. */
function githubOf(workflowRun: CiRun, runId = 1): Record<string, Value> {
  return {
    repository: REPOSITORY,
    run_id: runId,
    sha: NEWER_COMMIT,
    event_name: 'workflow_run',
    event: { workflow_run: { ...workflowRun } },
  };
}

function contextOf(workflowRun: CiRun, runId = 1): Context {
  return { github: githubOf(workflowRun, runId), vars: {}, secrets: {}, env: {} };
}

/** The jobs of a workflow that start, in order, given what its first job outputs. */
function jobsThatRun(workflow: Workflow, github: Record<string, Value>, output: string): string[] {
  const started: string[] = [];
  const settled = new Set<string>();
  const outputs: Record<string, Record<string, Value>> = {};
  const waiting = Object.keys(workflow.jobs);
  while (waiting.length > 0) {
    const next = waiting.find((id) =>
      needsOf(workflow.jobs[id]).every((need) => settled.has(need)),
    );
    if (next === undefined) {
      throw new Error('The needs of the jobs have a cycle.');
    }
    waiting.splice(waiting.indexOf(next), 1);
    const job = workflow.jobs[next];
    const needs = needsOf(job);
    const context: Context = {
      github,
      vars: {},
      secrets: {},
      env: {},
      needs: Object.fromEntries(needs.map((need) => [need, { outputs: outputs[need] ?? {} }])),
    };
    // A job whose need did not run is skipped, unless its condition names a status.
    const status = needs.every((need) => started.includes(need)) ? 'success' : 'failure';
    if (jobRuns(job.if, context, status)) {
      started.push(next);
      outputs[next] = Object.fromEntries(
        Object.keys(job.outputs ?? {}).map((name) => [name, output]),
      );
    }
    settled.add(next);
  }
  return started;
}

function world(overrides: Partial<World> = {}): World {
  return {
    outputs: OUTPUTS,
    secrets: SECRETS,
    hostnames: ['lb.example.test'],
    tip: COMMIT,
    ...overrides,
  };
}

interface RunOptions {
  vars?: Record<string, string>;
  hostnames?: Array<string | null>;
  helmExit?: number;
}

function runWith(jobId: string, options: RunOptions = {}): Promise<JobResult> {
  return runJob(cd, jobId, {
    github: githubOf(PASSED),
    vars: options.vars,
    world: world({
      ...(options.hostnames === undefined ? {} : { hostnames: options.hostnames }),
      ...(options.helmExit === undefined ? {} : { helmExit: options.helmExit }),
    }),
  });
}

/** Runs a job, hands the result to a check, and removes what the run made, whatever the check says. */
async function during(
  jobId: string,
  options: RunOptions,
  check: (result: JobResult) => void | Promise<void>,
): Promise<void> {
  const result = await runWith(jobId, options);
  try {
    await check(result);
  } finally {
    result.dispose();
  }
}

/** The arguments after `helm` of every call that upgrades the release. */
function helmUpgrades(calls: Call[]): string[][] {
  return calls
    .filter((call) => call.tool === 'helm' && call.args[0] === 'upgrade')
    .map((call) => call.args);
}

/** The value after a flag. */
function option(args: string[], flag: string): string | undefined {
  return args[args.indexOf(flag) + 1];
}

/** The `--set-string key=value` pairs of a call, by key. */
function settings(args: string[]): Record<string, string> {
  return Object.fromEntries(
    args.flatMap((argument, index) => {
      const separator = argument.indexOf('=');
      return args[index - 1] === '--set-string'
        ? [[argument.slice(0, separator), argument.slice(separator + 1)]]
        : [];
    }),
  );
}

function appUrls(calls: Call[]): string[] {
  return helmUpgrades(calls).map((upgrade) => settings(upgrade)['config.APP_PUBLIC_URL']);
}

function secondsSlept(calls: Call[]): number {
  return calls
    .filter((call) => call.tool === 'sleep')
    .reduce((total, call) => total + Number(call.args[0]), 0);
}

/** The Kubernetes minor of prod, which `helm template` needs to render the API versions. */
function kubernetesMinor(): string {
  const tfvars = blockArguments(
    withoutComments(readText(join(REPOSITORY_ROOT, 'infra/environments/prod.tfvars'))),
  );
  return unquoted(tfvars.kubernetes_version) ?? '';
}

/** How long the role the bootstrap makes lets a session last: an hour unless it says otherwise. */
function sessionSeconds(): number {
  const bootstrap = withoutComments(readText(join(REPOSITORY_ROOT, 'infra/bootstrap/main.tf')));
  const role = blocks(bootstrap, 'resource').find(
    (block) => block.labels.join('.') === 'aws_iam_role.deploy',
  );
  expect(role, 'the bootstrap makes the deploy role').toBeDefined();
  return Number(blockArguments(role?.body ?? '').max_session_duration ?? 3600);
}

const MAIN_JOBS = ['tip', 'terraform', 'image', 'deploy'];
const AWS_JOBS = ['terraform', 'image', 'deploy'];

describe('Workflows', () => {
  it('pins each action to a full commit SHA and names its release in a comment', () => {
    for (const file of workflowFiles()) {
      const used = workflowText(file)
        .split('\n')
        .filter((line) => /^\s*(?:-\s+)?uses:/.test(line));

      expect(used.length, `${file} uses an action`).toBeGreaterThan(0);
      for (const line of used) {
        expect(line, `${file}: ${line.trim()}`).toMatch(
          /uses:\s+[\w.-]+\/[\w.-]+@[0-9a-f]{40}\s+# v\d+\.\d+\.\d+\s*$/,
        );
      }
    }
  });

  it('keeps the checkout token out of the working folder', () => {
    for (const file of workflowFiles()) {
      const checkouts = Object.values(readWorkflow(file).jobs).flatMap((job) =>
        actionSteps(job).filter((step) => step.uses.startsWith('actions/checkout@')),
      );

      expect(checkouts.length, file).toBeGreaterThan(0);
      for (const step of checkouts) {
        expect(step.with?.['persist-credentials'], file).toBe(false);
      }
    }
  });

  it('stops a script at its first error and gives every job a timeout', () => {
    for (const file of workflowFiles()) {
      const workflow = readWorkflow(file);

      expect(workflow.defaults?.run?.shell, `${file} shell`).toBe('bash');
      for (const [id, job] of Object.entries(workflow.jobs)) {
        expect(job['timeout-minutes'], `${file} ${id}`).toBeGreaterThan(0);
      }
    }
  });

  it('keeps the AWS account id out of the workflows', () => {
    for (const file of workflowFiles()) {
      expect(workflowText(file), file).not.toMatch(/(?<![\w-])\d{12}(?![\w-])/);
    }
  });
});

describe('CI workflow', () => {
  it('runs lint, unit and build as parallel jobs on every push and pull request', () => {
    const triggers = triggersOf(ci);
    const commands: Record<string, string> = {
      lint: 'npm run lint',
      unit: 'npm run test:unit',
      build: 'npm run build',
    };

    expect(Object.keys(triggers).sort()).toEqual(['pull_request', 'push']);
    for (const [name, filters] of Object.entries(triggers)) {
      expect(Object.keys(filters), `${name} has no branch, path, tag or type filter`).toEqual([]);
    }
    expect(Object.keys(ci.jobs).sort()).toEqual(['build', 'lint', 'unit']);
    for (const [id, command] of Object.entries(commands)) {
      const job = ci.jobs[id];
      const step = scriptSteps(job).find((candidate) => candidate.run.trim() === command);

      expect(needsOf(job), `${id} waits for no job`).toEqual([]);
      expect(job.if, `${id} always runs`).toBeUndefined();
      expect(NO_FAILURE, `${id} does not go on after an error`).toContain(job['continue-on-error']);
      expect(step, `${id} runs ${command}`).toBeDefined();
      expect(step?.if, `${id} runs ${command} every time`).toBeUndefined();
      expect(NO_FAILURE, `${command} does not go on after an error`).toContain(
        step?.['continue-on-error'],
      );
    }
  });

  it('installs from the lock file before it runs a command', () => {
    for (const [id, job] of Object.entries(ci.jobs)) {
      const runs = scriptSteps(job).map((step) => step.run.trim());

      expect(runs[0], `${id} installs first`).toBe('npm ci');
      expect(runs.length, `${id} runs a command after the install`).toBeGreaterThan(1);
    }
  });

  it('asks for read access to the repository and nothing else', () => {
    expect(ci.permissions).toEqual({ contents: 'read' });
    for (const [id, job] of Object.entries(ci.jobs)) {
      expect(permissionsOf(ci, job), id).toEqual({ contents: 'read' });
    }
    expect(workflowText('ci.yml')).not.toMatch(/aws|id-token|secrets\./i);
  });

  it('runs the Node major version that the production image runs', () => {
    const image = /^FROM node:(\d+)-/m.exec(readText(join(REPOSITORY_ROOT, 'Dockerfile')));

    expect(image, 'the Dockerfile names a node image').not.toBeNull();
    for (const [id, job] of Object.entries(ci.jobs)) {
      const setup = actionSteps(job).find((step) => step.uses.startsWith('actions/setup-node@'));

      expect(String(setup?.with?.['node-version']), id).toBe(image?.[1]);
    }
  });
});

describe('CD workflow', () => {
  beforeAll(async () => {
    // The scripts of the steps run here as they run on the runner, and the deploy reads JSON with jq.
    const jq = await run('jq', ['--version'], { allowFailure: true });

    expect(jq.code, 'jq is on the PATH, which the CD script and these specs need').toBe(0);
  });

  it('names the CI workflow that starts it', () => {
    const started = triggersOf(cd).workflow_run;

    expect(Object.keys(triggersOf(cd))).toEqual(['workflow_run']);
    expect(started.workflows).toEqual([ci.name]);
    expect(started.types).toEqual(['completed']);
  });

  it('deploys only after a successful CI of a push to main', () => {
    for (const [name, payload, deploys] of EXAMPLES) {
      // A run that deploys nothing stops before its first job, so no job runs at all.
      expect(jobsThatRun(cd, githubOf(payload), 'true'), name).toEqual(deploys ? MAIN_JOBS : []);
    }

    // The CI passed on a push to main, and a newer commit is the tip now: the older one deploys nothing.
    expect(jobsThatRun(cd, githubOf(PASSED), 'false')).toEqual(['tip']);

    // A job that needs a skipped job is skipped, unless its condition names a status.
    for (const [id, job] of Object.entries(cd.jobs)) {
      expect(hasStatusFunction(String(job.if ?? '')), `${id} names no status`).toBe(false);
      expect(NO_FAILURE, `${id} does not go on after an error`).toContain(job['continue-on-error']);
      if (id !== 'tip') {
        expect(ancestorsOf(cd, id), `${id} waits for the tip check`).toContain('tip');
      }
    }
  });

  it('skips a commit that is no longer the tip of main', async () => {
    for (const [tip, deploy] of [
      [COMMIT, 'true'],
      [NEWER_COMMIT, 'false'],
    ] as const) {
      const result = await runJob(cd, 'tip', { github: githubOf(PASSED), world: world({ tip }) });
      try {
        const [call] = result.calls;

        expect(result.failed, `a run with the tip at ${tip.slice(0, 7)} does not fail`).toBe(false);
        expect(result.githubOutput).toEqual({ deploy });
        expect(result.calls).toHaveLength(1);
        expect([call.tool, call.args[0]]).toEqual(['gh', 'api']);
        expect(call.args.join(' ')).toContain(`repos/${REPOSITORY}/branches/main`);
      } finally {
        result.dispose();
      }
    }
  });

  it('applies Terraform, pushes the image and upgrades the chart in that order', async () => {
    // Each job waits for the one before it.
    expect(needsOf(cd.jobs.terraform)).toEqual(['tip']);
    expect(needsOf(cd.jobs.image)).toEqual(['terraform']);
    expect(needsOf(cd.jobs.deploy)).toEqual(['image']);

    // Every job checks out the commit the CI tested, though github.sha is the tip of main.
    const context = contextOf(PASSED);
    expect(interpolate(String(cd.env?.COMMIT), context)).toBe(COMMIT);
    for (const id of AWS_JOBS) {
      const checkout = actionSteps(cd.jobs[id]).find((step) =>
        step.uses.startsWith('actions/checkout@'),
      );

      expect(
        interpolate(String(checkout?.with?.ref), context),
        `${id} checks out the tested commit`,
      ).toBe(COMMIT);
    }

    // Terraform applies the prod files.
    await during('terraform', {}, (terraform) => {
      const [init, apply] = terraform.calls.map((call) => call.args);

      expect(terraform.calls.map((call) => call.tool)).toEqual(['terraform', 'terraform']);
      expect(init).toContain('init');
      expect(init).toContain('-backend-config=environments/prod.backend.hcl');
      expect(apply).toContain('apply');
      expect(apply).toContain('-var-file=environments/prod.tfvars');
      expect(apply).toContain('-auto-approve');
      expect(apply).toContain('-input=false');
      for (const file of ['prod.tfvars', 'prod.backend.hcl']) {
        expect(
          () => readText(join(REPOSITORY_ROOT, 'infra/environments', file)),
          file,
        ).not.toThrow();
      }
    });

    // The image takes the commit's SHA as its tag, in the repository Terraform made.
    await during('image', {}, (image) => {
      const docker = image.calls.filter((call) => call.tool === 'docker');
      const [login, build, push] = docker;

      expect(docker.map((call) => call.args[0])).toEqual(['login', 'build', 'push']);
      expect(login.args).toEqual([
        'login',
        '--username',
        'AWS',
        '--password-stdin',
        'registry.example.test',
      ]);
      expect(login.stdin).toBe('ecr-token\n');
      expect(build.args.slice(0, 3)).toEqual([
        'build',
        '--tag',
        `registry.example.test/workshop-prod:${COMMIT}`,
      ]);
      expect(push.args).toEqual(['push', `registry.example.test/workshop-prod:${COMMIT}`]);
      expect(image.calls.find((call) => call.tool === 'aws')?.args).toContain('us-east-1');
    });

    // The chart is upgraded with the prod values, that tag and --wait, and with every value it needs.
    await during('deploy', {}, (deploy) => {
      const upgrades = helmUpgrades(deploy.calls);
      const upgrade = upgrades[0];

      expect(deploy.failed).toBe(false);
      expect(upgrades).toHaveLength(1);
      expect(upgrade.slice(0, 4)).toEqual(['upgrade', '--install', 'workshop', 'k8s/workshop']);
      expect(option(upgrade, '--values')).toBe('k8s/workshop/values-prod.yaml');
      expect(option(upgrade, '--namespace')).toBe('workshop');
      expect(upgrade).toContain('--create-namespace');
      expect(upgrade).toContain('--wait');
      expect(settings(upgrade)['image.tag']).toBe(COMMIT);
      expect(settings(upgrade)['image.repository']).toBe('registry.example.test/workshop-prod');
      expect(upgrade, 'a manual override must not survive the next deploy').not.toContain(
        '--reuse-values',
      );
      expect(Object.keys(settings(upgrade)).sort()).toEqual(DEPLOY_KEYS);
      expect(settings(upgrade), 'each value comes from the output that names it').toMatchObject({
        'image.repository': String(OUTPUTS.repository_url),
        'config.DATABASE_HOST': String(OUTPUTS.database_host),
        'config.DATABASE_PORT': String(OUTPUTS.database_port),
        'config.DATABASE_NAME': String(OUTPUTS.database_name),
        'config.DATABASE_USER': String(OUTPUTS.database_user),
        'config.REDIS_HOST': String(OUTPUTS.redis_host),
        'config.REDIS_PORT': String(OUTPUTS.redis_port),
        'config.APP_PUBLIC_URL': 'http://lb.example.test',
      });
      // Every value goes in as a string, because a SHA of digits only would become a number.
      expect(upgrade.filter((argument) => /^--set(?!-string$)/.test(argument))).toEqual([]);
      expect(upgrade.filter((argument) => argument === '--set-string')).toHaveLength(
        DEPLOY_KEYS.length,
      );
    });
  });

  it('waits long enough for a first install', async () => {
    await during('deploy', {}, (deploy) => {
      const minutes = Number(
        /^(\d+)m$/.exec(option(helmUpgrades(deploy.calls)[0], '--timeout') ?? '')?.[1],
      );

      // A first install pulls the image, runs the migration (up to 5 minutes) and waits for the load balancer.
      expect(minutes).toBeGreaterThanOrEqual(10);
      // Two upgrades and the wait for the load balancer fit in the time of the job.
      expect(2 * minutes + 10).toBeLessThanOrEqual(cd.jobs.deploy['timeout-minutes'] ?? 0);
    });
  });

  it('ends each job before its credentials expire', () => {
    const lasts = sessionSeconds();

    for (const id of AWS_JOBS) {
      const job = cd.jobs[id];
      const requested = actionSteps(job).flatMap(
        (step) => step.with?.['role-duration-seconds'] ?? [],
      );

      expect(job['timeout-minutes'] ?? Infinity, `${id} has a timeout`).toBeLessThan(Infinity);
      expect(
        Math.max(0, ...requested.map(Number)),
        `${id} asks for a session the role allows`,
      ).toBeLessThanOrEqual(lasts);
      expect(
        (job['timeout-minutes'] ?? Infinity) * 60,
        `${id} ends before its session does`,
      ).toBeLessThanOrEqual(
        requested.length > 0 ? Math.min(...requested.map(Number)) : Math.min(lasts, 3600),
      );
    }
  });

  it('assumes the role in the region of the Terraform files', () => {
    const regionOf = (file: string): string | undefined =>
      unquoted(
        blockArguments(withoutComments(readText(join(REPOSITORY_ROOT, 'infra/environments', file))))
          .region,
      );
    const context = contextOf(PASSED);
    const region = toText(interpolate(String(cd.env?.AWS_REGION), context));

    expect(regionOf('prod.tfvars'), 'prod.tfvars sets a region').toBeTruthy();
    expect(regionOf('prod.backend.hcl'), 'the state is in the region of the stack').toBe(
      regionOf('prod.tfvars'),
    );
    expect(region).toBe(regionOf('prod.tfvars'));
    for (const id of AWS_JOBS) {
      const assume = actionSteps(cd.jobs[id]).find((step) =>
        step.uses.startsWith('aws-actions/configure-aws-credentials@'),
      );

      expect(
        interpolate(String(assume?.with?.['aws-region']), {
          ...context,
          env: { AWS_REGION: region },
        }),
        `${id} assumes the role in that region`,
      ).toBe(region);
    }
  });

  it('hands the cluster administrators to Terraform from the prod variable, or an empty list', async () => {
    const admins = '["arn:aws:iam::<account-id>:user/ana"]';

    for (const [vars, expected] of [
      [{ CLUSTER_ADMIN_ARNS: admins }, admins],
      [{}, '[]'],
    ] as const) {
      await during('terraform', { vars }, (terraform) => {
        const apply = terraform.calls.find((call) => call.args.includes('apply'));

        expect(apply?.env?.TF_VAR_cluster_admin_arns).toBe(expected);
      });
    }
  });

  it('queues a second deploy behind the first', () => {
    const concurrency = cd.concurrency as {
      group: string;
      'cancel-in-progress'?: boolean | string;
    };
    const groupOf = (payload: CiRun, runId: number): Value =>
      interpolate(concurrency.group, contextOf(payload, runId));

    // A running deploy is never cancelled, and a second run waits in the group of the first.
    expect(typeof concurrency).toBe('object');
    expect(concurrency['cancel-in-progress']).toBe(false);
    const first = groupOf(PASSED, 11);
    expect(first).toBeTruthy();
    expect(groupOf(ciRun('success', 'push', 'main', { sha: NEWER_COMMIT }), 12)).toBe(first);

    // A run that deploys nothing takes no place in the queue of a deploy.
    for (const [name, payload] of EXAMPLES.filter(([, , deploys]) => !deploys)) {
      expect(groupOf(payload, 13), name).not.toBe(first);
      expect(groupOf(payload, 13), `${name} has a group of its own`).not.toBe(groupOf(payload, 14));
    }
    for (const job of Object.values(cd.jobs)) {
      expect(job.concurrency, 'a group on a job would let two deploys interleave').toBeUndefined();
    }
  });

  it('assumes the deploy role through OIDC and names no access key', () => {
    const accessKey =
      /aws[-_]access[-_]key|aws[-_]secret[-_]access|aws[-_]session[-_]token|AKIA[0-9A-Z]{16}|secrets\.AWS/i;
    for (const file of workflowFiles()) {
      expect(workflowText(file), `${file} names no access key`).not.toMatch(accessKey);
    }

    const credentials = (job: Job) =>
      actionSteps(job).filter((step) =>
        step.uses.startsWith('aws-actions/configure-aws-credentials@'),
      );
    const awsJobs = Object.entries(cd.jobs).filter(([, job]) => credentials(job).length > 0);
    expect(awsJobs.map(([id]) => id)).toEqual(AWS_JOBS);
    for (const [id, job] of awsJobs) {
      const [assume, ...others] = credentials(job);
      const firstScript = job.steps.findIndex((step) => step.run !== undefined);

      expect(others, `${id} assumes the role once`).toEqual([]);
      expect(
        job.steps.indexOf(assume),
        `${id} assumes the role before it runs anything`,
      ).toBeLessThan(firstScript);
      expect(assume.with?.['role-to-assume'], id).toBe('${{ vars.AWS_DEPLOY_ROLE_ARN }}');
      expect(assume.with?.['mask-aws-account-id'], `${id} hides the account id`).toBe(true);
      expect(environmentOf(job), `${id} runs in the environment the role trusts`).toBe('prod');
      expect(permissionsOf(cd, job), id).toEqual({ contents: 'read', 'id-token': 'write' });
    }

    // A job that calls no AWS API gets no OIDC token, and the CI gets none either.
    expect(permissionsOf(cd, cd.jobs.tip)).toEqual({ contents: 'read' });
    expect(Object.values(ci.jobs).some((job) => 'id-token' in permissionsOf(ci, job))).toBe(false);

    // The role is the one the bootstrap makes, and it trusts the environment the jobs run in.
    expect(readText(join(REPOSITORY_ROOT, 'infra/bootstrap/main.tf'))).toContain(
      ':environment:${var.github_environment}',
    );
    expect(readText(join(REPOSITORY_ROOT, 'infra/bootstrap/variables.tf'))).toMatch(
      /variable "github_environment"[^}]*default\s*=\s*"prod"/,
    );
  });

  it('reads the secrets from Secrets Manager at run time', async () => {
    await during('deploy', {}, async (deploy) => {
      const upgrade = helmUpgrades(deploy.calls)[0];
      const reads = deploy.calls.filter(
        (call) => call.tool === 'aws' && call.args[0] === 'secretsmanager',
      );
      const lines = deploy.output.split('\n');

      // The names come from the outputs of Terraform, and the values from Secrets Manager.
      expect(reads.map((call) => option(call.args, '--secret-id')).sort()).toEqual(
        Object.keys(SECRETS).sort(),
      );
      expect(settings(upgrade)['secrets.DATABASE_PASSWORD']).toBe(DATABASE_PASSWORD);
      expect(settings(upgrade)['secrets.JWT_SECRET']).toBe(JWT_SECRET);

      // Both are masked, and every line that holds one comes after its mask. The helm stand-in prints
      // its arguments, which is the worst case for a secret on the command line.
      for (const value of [DATABASE_PASSWORD, JWT_SECRET]) {
        const mask = lines.indexOf(`::add-mask::${value}`);
        const printed = lines.findIndex((line, index) => index !== mask && line.includes(value));

        expect(mask, 'a mask for the secret').toBeGreaterThanOrEqual(0);
        expect(printed, 'a line that holds the secret').toBeGreaterThan(mask);
        expect(
          lines
            .filter((line) => line.includes(value) && !line.startsWith('::add-mask::'))
            .every((line) => lines.indexOf(line) > mask),
        ).toBe(true);
        expect(deploy.summary).not.toContain(value);
      }

      // No file of the repository holds a secret.
      for (const value of [DATABASE_PASSWORD, JWT_SECRET]) {
        const found = await run('grep', ['-rlF', '--', value, deploy.workspace], {
          allowFailure: true,
        });

        expect(found.stdout, 'a file of the repository holds the secret').toBe('');
      }
    });
  });

  it('masks each secret in the line after it reads it', () => {
    const upgrade = scriptSteps(cd.jobs.deploy).find((step) => step.run.includes('helm upgrade'));
    const lines = logicalLines(upgrade?.run ?? '');

    for (const variable of ['database_password', 'jwt_secret']) {
      const read = lines.findIndex((line) => line.startsWith(`${variable}=`));

      expect(read, `${variable} is read`).toBeGreaterThanOrEqual(0);
      expect(lines[read + 1], `${variable} is masked right after it is read`).toBe(
        `echo "::add-mask::$${variable}"`,
      );
    }
    expect(upgrade?.run, 'the script never traces its commands').not.toMatch(
      /set -\w*x|bash -x|xtrace/,
    );
  });

  it("points APP_PUBLIC_URL at the load balancer's hostname", async () => {
    // A first install: no Service yet, so a placeholder goes in, and the hostname goes in next.
    await during('deploy', { hostnames: ['', '', 'new.lb.example.test'] }, (first) => {
      const [placeholder, real] = appUrls(first.calls);
      const [one, two] = helmUpgrades(first.calls).map(settings);

      expect(first.failed).toBe(false);
      expect(appUrls(first.calls)).toHaveLength(2);
      expect(real).toBe('http://new.lb.example.test');
      expect(placeholder).not.toBe(real);
      expect(['http:', 'https:']).toContain(new URL(placeholder).protocol);
      expect(secondsSlept(first.calls), 'it waits for the hostname').toBeGreaterThan(0);
      expect(first.summary).toContain('http://new.lb.example.test');
      // It reads the hostname of the Service of the release, where Kubernetes puts it.
      const reads = first.calls.filter(
        (call) => call.tool === 'kubectl' && call.args[0] === 'get' && call.args[1] === 'service',
      );
      expect(reads.length).toBeGreaterThanOrEqual(3);
      for (const read of reads) {
        expect(read.args[2]).toBe('workshop');
        expect(option(read.args, '--namespace')).toBe('workshop');
        expect(option(read.args, '--output')).toBe(
          'jsonpath={.status.loadBalancer.ingress[0].hostname}',
        );
      }
      // The second upgrade changes the URL and nothing else.
      expect({ ...one, 'config.APP_PUBLIC_URL': real }).toEqual(two);
    });

    // A release that has its hostname upgrades once, with that hostname.
    await during('deploy', { hostnames: ['lb.example.test'] }, (same) => {
      expect(same.failed).toBe(false);
      expect(appUrls(same.calls)).toEqual(['http://lb.example.test']);
      expect(secondsSlept(same.calls)).toBe(0);
    });

    // The hostname changed during the upgrade: it upgrades again with the new one.
    await during(
      'deploy',
      { hostnames: ['old.lb.example.test', 'new.lb.example.test'] },
      (changed) => {
        expect(appUrls(changed.calls)).toEqual([
          'http://old.lb.example.test',
          'http://new.lb.example.test',
        ]);
      },
    );

    // A read that fails while the job waits is tried again.
    await during('deploy', { hostnames: ['', null, 'new.lb.example.test'] }, (retried) => {
      expect(retried.failed).toBe(false);
      expect(appUrls(retried.calls)).toHaveLength(2);
      expect(appUrls(retried.calls)[1]).toBe('http://new.lb.example.test');
    });

    // The load balancer never gets a hostname: the job waits a limited time, fails, and says why.
    await during('deploy', { hostnames: [''] }, (never) => {
      expect(never.failed).toBe(true);
      expect(never.output).toMatch(/load balancer/i);
      expect(appUrls(never.calls)).toHaveLength(1);
      expect(secondsSlept(never.calls)).toBeGreaterThanOrEqual(300);
      expect(secondsSlept(never.calls)).toBeLessThanOrEqual(1800);
    });
  });

  it('upgrades nothing when the cluster cannot be read', async () => {
    await during('deploy', { hostnames: [null] }, (result) => {
      expect(result.failed).toBe(true);
      expect(helmUpgrades(result.calls)).toEqual([]);
    });
  });

  it('shows the migration log when the upgrade fails', async () => {
    const logged = (result: JobResult): boolean =>
      result.calls.some(
        (call) =>
          call.tool === 'kubectl' &&
          call.args.includes('logs') &&
          call.args.includes('job/workshop-migrate'),
      );

    await during('deploy', { helmExit: 1 }, (failed) => {
      expect(failed.failed).toBe(true);
      expect(logged(failed)).toBe(true);
    });
    await during('deploy', {}, (passed) => {
      expect(logged(passed)).toBe(false);
    });
  });

  it('renders the chart with the values the deploy passes, and the application accepts them', async () => {
    interface Rendered {
      kind: string;
      metadata: { name: string };
      data?: Record<string, string>;
    }

    await during('deploy', { hostnames: ['', 'new.lb.example.test'] }, async (deploy) => {
      const upgrades = helmUpgrades(deploy.calls);

      // The first upgrade holds the placeholder and the second the hostname. Each one has to render.
      expect(upgrades).toHaveLength(2);
      for (const upgrade of upgrades) {
        const rendered = await run(
          join(REPOSITORY_ROOT, 'scripts/tool.sh'),
          [
            ...['helm', 'template', 'workshop', CHART, '--namespace', 'workshop'],
            ...[
              '--kube-version',
              `v${kubernetesMinor()}.0`,
              '--values',
              join(CHART, 'values-prod.yaml'),
            ],
            ...Object.entries(settings(upgrade)).flatMap(([key, value]) => [
              '--set-string',
              `${key}=${value}`,
            ]),
          ],
          { cwd: REPOSITORY_ROOT, allowFailure: true },
        );
        expect(rendered.code, rendered.stderr).toBe(0);

        const objects = parseAllDocuments(rendered.stdout).map(
          (document) => document.toJSON() as Rendered | null,
        );
        const find = (kind: string): Rendered | undefined =>
          objects.find((object) => object?.kind === kind && object.metadata.name === 'workshop') ??
          undefined;
        const environment = {
          ...find('ConfigMap')?.data,
          ...Object.fromEntries(
            Object.entries(find('Secret')?.data ?? {}).map(([key, value]) => [
              key,
              Buffer.from(value, 'base64').toString('utf8'),
            ]),
          ),
        };

        expect(validateEnv(environment).APP_PUBLIC_URL).toBe(
          settings(upgrade)['config.APP_PUBLIC_URL'],
        );
        expect(environment.DATABASE_PASSWORD).toBe(DATABASE_PASSWORD);
      }
    });
  });

  it('reads only outputs that Terraform declares', () => {
    const declared = [
      ...readText(join(REPOSITORY_ROOT, 'infra/outputs.tf')).matchAll(/^output "(\w+)"/gm),
    ].map((match) => match[1]);

    for (const name of Object.keys(OUTPUTS)) {
      expect(declared, `Terraform declares the output ${name}`).toContain(name);
    }
  });
});
