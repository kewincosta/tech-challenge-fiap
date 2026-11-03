import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseDotenv } from 'dotenv';
import Redis from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { uniqueValidCpf } from '../../support/factories/document.factory';
import {
  buildImage,
  Cleanup,
  docker,
  REPOSITORY_ROOT,
  run,
  uniqueName,
  waitUntil,
  type CommandResult,
} from '../support/docker';
import { connectionTo, type ThrowawayPostgres } from '../support/postgres';

const SCRIPT = join(REPOSITORY_ROOT, 'scripts/local-cluster.sh');
const TOOL = join(REPOSITORY_ROOT, 'scripts/tool.sh');
const MIGRATIONS = join(REPOSITORY_ROOT, 'src/shared/infrastructure/database/migrations');
const KUBECONFIG = join(REPOSITORY_ROOT, '.tools/kind/workshop.kubeconfig');
const CLUSTER = 'workshop';
const NODE = `${CLUSTER}-control-plane`;
const NAMESPACE = 'workshop';
const BASE_URL = 'http://localhost:18080';
const COMPOSE_SERVICES = ['postgres', 'redis', 'mailpit'];
// The Redis index of this spec: not 0, which the development stack uses, and not 15, which the
// integration and e2e suites use.
const REDIS_DB = 12;
const IMAGE_REPOSITORY = 'workshop-cluster-test';
const IMAGE = `${IMAGE_REPOSITORY}:local`;
// The first up raises the rate limit the way k8s/README.md does for the scaling demonstration, so
// the k6 scenario is not answered with 429.
const RAISE_RATE_LIMIT = ['--set', 'config.RATE_LIMIT_MAX_REQUESTS=1000000'];

const cleanup = new Cleanup();

let dotenv: Record<string, string>;
let database: string;
let postgres: ThrowawayPostgres;
let up = false;
let admin: { email: string; password: string; document: string };
let nodeId: string;
let composeContainers: string;

function lastLines(result: CommandResult): string {
  return `${result.stdout}${result.stderr}`.trim().split('\n').slice(-40).join('\n');
}

/** Runs scripts/local-cluster.sh for the development stack, with the database and Redis index of this spec. */
function script(args: string[], environment: Record<string, string> = {}): Promise<CommandResult> {
  return run(SCRIPT, args, {
    cwd: REPOSITORY_ROOT,
    allowFailure: true,
    env: {
      ...process.env,
      LOCAL_CLUSTER_DATABASE_NAME: database,
      LOCAL_CLUSTER_REDIS_DB: String(REDIS_DB),
      LOCAL_CLUSTER_IMAGE: IMAGE,
      ...environment,
    },
  });
}

function tool(args: string[], environment: Record<string, string> = {}): Promise<CommandResult> {
  return run(TOOL, args, {
    cwd: REPOSITORY_ROOT,
    allowFailure: true,
    env: { ...process.env, KUBECONFIG, ...environment },
  });
}

async function kubectl(args: string[]): Promise<string> {
  const result = await tool(['kubectl', ...args]);
  expect(result.code, `kubectl ${args.join(' ')}: ${lastLines(result)}`).toBe(0);
  return result.stdout;
}

async function kubectlJson<T>(args: string[]): Promise<T> {
  return JSON.parse(await kubectl([...args, '--output', 'json'])) as T;
}

async function clusterNames(): Promise<string[]> {
  return (await tool(['kind', 'get', 'clusters'])).stdout.split('\n').filter(Boolean);
}

function compose(args: string[]): Promise<CommandResult> {
  return docker(['compose', ...args], { cwd: REPOSITORY_ROOT, allowFailure: true });
}

/** The ids of the containers of the compose services, running or not, as one comparable text. */
async function composeIds(all = false): Promise<string> {
  const result = await compose(['ps', ...(all ? ['--all'] : []), '--quiet', ...COMPOSE_SERVICES]);
  return result.stdout.split('\n').filter(Boolean).sort().join(' ');
}

async function hostPort(service: string, containerPort: number): Promise<number> {
  const { stdout } = await compose(['port', service, String(containerPort)]);
  const port = /:(\d+)\s*$/m.exec(stdout)?.[1];
  expect(port, `compose publishes ${service}:${containerPort}: ${stdout}`).toBeDefined();
  return Number(port);
}

async function ready(): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${BASE_URL}/health/ready`, { signal: AbortSignal.timeout(5000) });
  return { status: response.status, body: await response.json() };
}

async function queryDatabase<T>(sql: string, parameters: unknown[] = []): Promise<T[]> {
  const connection = connectionTo(postgres, database);
  await connection.initialize();
  try {
    return await connection.query<T[]>(sql, parameters);
  } finally {
    await connection.destroy();
  }
}

function migrationTimestamps(): number[] {
  return readdirSync(MIGRATIONS)
    .filter((file) => /^\d+-.+\.ts$/.test(file))
    .map((file) => Number(file.split('-')[0]))
    .sort((a, b) => a - b);
}

interface PodList {
  items: Array<{ status: { startTime: string; phase: string } }>;
}

beforeAll(async () => {
  // Nothing below may touch a cluster the developer made: stop before anything is registered to be
  // removed.
  const existing = await clusterNames();
  if (existing.includes(CLUSTER)) {
    throw new Error(
      `A kind cluster named ${CLUSTER} exists. This spec creates and deletes that cluster, so it does ` +
        'not run beside yours. Delete yours with scripts/local-cluster.sh down first.',
    );
  }

  // The script reads .env. A clone with no .env gets the example for the length of the run.
  const dotenvPath = join(REPOSITORY_ROOT, '.env');
  if (!existsSync(dotenvPath)) {
    copyFileSync(join(REPOSITORY_ROOT, '.env.example'), dotenvPath);
    cleanup.add(() => Promise.resolve(rmSync(dotenvPath, { force: true })));
  }
  dotenv = parseDotenv(readFileSync(dotenvPath));

  // kind creates the Docker network of its clusters and leaves it when they go.
  const networks = (await docker(['network', 'ls', '--format', '{{.Name}}'])).stdout.split('\n');
  if (!networks.includes('kind')) {
    cleanup.add(() => docker(['network', 'rm', 'kind'], { allowFailure: true }));
  }

  // The development stack: start what is down, leave what runs as it is, and give back what this
  // spec started.
  const running = (await compose(['ps', '--status', 'running', '--services'])).stdout.split('\n');
  const existed = (await compose(['ps', '--all', '--services'])).stdout.split('\n');
  const stopped = COMPOSE_SERVICES.filter((service) => !running.includes(service));
  if (stopped.length > 0) {
    cleanup.add(async () => {
      for (const service of stopped) {
        await compose(
          existed.includes(service)
            ? ['stop', service]
            : ['rm', '--stop', '--force', '--volumes', service],
        );
      }
    });
    const started = await compose(['up', '--detach', '--wait', '--no-recreate', ...stopped]);
    expect(started.code, `docker compose up ${stopped.join(' ')}: ${lastLines(started)}`).toBe(0);
  }

  // A database and a Redis index of its own: workshop and workshop_test are never touched.
  postgres = {
    container: 'compose',
    hostPort: await hostPort('postgres', 5432),
    user: dotenv.DATABASE_USER,
    password: dotenv.DATABASE_PASSWORD,
  };
  database = uniqueName('workshop_cluster').replace(/-/g, '_');
  const maintenance = connectionTo(postgres, 'postgres');
  await maintenance.initialize();
  try {
    await maintenance.query(`CREATE DATABASE "${database}"`);
  } finally {
    await maintenance.destroy();
  }
  cleanup.add(async () => {
    const connection = connectionTo(postgres, 'postgres');
    await connection.initialize();
    try {
      await connection.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    } finally {
      await connection.destroy();
    }
  });

  const redisPort = await hostPort('redis', 6379);
  const flush = async (): Promise<void> => {
    const redis = new Redis({ host: '127.0.0.1', port: redisPort, db: REDIS_DB });
    try {
      await redis.flushdb();
    } finally {
      redis.disconnect();
    }
  };
  await flush();
  cleanup.add(flush);

  cleanup.add(() => docker(['rmi', '--force', IMAGE], { allowFailure: true }));
  cleanup.add(async () => {
    const result = await script(['down']);
    if (result.code !== 0) {
      throw new Error(`scripts/local-cluster.sh down failed:\n${lastLines(result)}`);
    }
  });
});

afterAll(async () => {
  await cleanup.run();
});

describe('Local cluster', () => {
  it('stops with a message naming PostgreSQL when the compose PostgreSQL is down', async () => {
    // A compose project of its own has no containers, so its PostgreSQL is down while the
    // development stack keeps running.
    const result = await script(['up'], { COMPOSE_PROJECT_NAME: uniqueName('workshop-no-stack') });

    expect(result.code, lastLines(result)).not.toBe(0);
    expect(result.stderr).toContain('PostgreSQL');
    expect(await clusterNames(), 'no cluster was created').not.toContain(CLUSTER);
    const nodes = await docker([
      'ps',
      '--all',
      '--filter',
      `name=${NODE}`,
      '--format',
      '{{.Names}}',
    ]);
    expect(nodes.stdout.trim()).toBe('');
    expect(existsSync(KUBECONFIG)).toBe(false);
  }, 120_000);

  it('answers ready on localhost:18080 after up', async () => {
    composeContainers = await composeIds();
    expect(composeContainers.split(' ')).toHaveLength(COMPOSE_SERVICES.length);

    const result = await script(['up', ...RAISE_RATE_LIMIT]);
    expect(result.code, lastLines(result)).toBe(0);
    up = true;
    nodeId = (await docker(['inspect', '--format', '{{.Id}}', NODE])).stdout.trim();

    expect(await clusterNames()).toEqual([CLUSTER]);
    // metrics-server runs, and the image built from the working tree is in the node.
    const metricsServer = await kubectlJson<{ status: { availableReplicas: number } }>([
      ...['--namespace', 'kube-system', 'get', 'deployment', 'metrics-server'],
    ]);
    expect(metricsServer.status.availableReplicas).toBeGreaterThan(0);
    const deployment = await kubectlJson<{
      spec: { template: { spec: { containers: Array<{ image: string }> } } };
    }>(['--namespace', NAMESPACE, 'get', 'deployment', 'workshop']);
    const image = deployment.spec.template.spec.containers[0].image;
    expect(image).toMatch(new RegExp(`^${IMAGE_REPOSITORY}:[0-9a-f]{12}$`));
    // The node holds the layers of an image built from the working tree now.
    const tree = uniqueName('workshop-cluster-tree');
    cleanup.add(() => docker(['rmi', '--force', tree], { allowFailure: true }));
    await buildImage(tree);
    const treeLayers = JSON.parse(
      (await docker(['image', 'inspect', '--format', '{{json .RootFS.Layers}}', tree])).stdout,
    ) as string[];
    const inNode = JSON.parse(
      (await docker(['exec', NODE, 'crictl', 'inspecti', image])).stdout,
    ) as {
      info: { imageSpec: { rootfs: { diff_ids: string[] } } };
    };
    expect(treeLayers.length).toBeGreaterThan(0);
    expect(inNode.info.imageSpec.rootfs.diff_ids).toEqual(treeLayers);
    // The chart is installed with the local values.
    const release = JSON.parse(
      (await tool(['helm', 'status', 'workshop', '--namespace', NAMESPACE, '--output', 'json']))
        .stdout,
    ) as { version: number; info: { status: string } };
    expect([release.version, release.info.status]).toEqual([1, 'deployed']);
    const settings = await kubectlJson<{ data: Record<string, string> }>([
      ...['--namespace', NAMESPACE, 'get', 'configmap', 'workshop'],
    ]);
    expect(settings.data).toMatchObject({
      DATABASE_HOST: 'postgres',
      REDIS_HOST: 'redis',
      SMTP_HOST: 'mailpit',
      APP_PUBLIC_URL: BASE_URL,
      DATABASE_NAME: database,
      REDIS_DB: String(REDIS_DB),
    });

    const answer = await waitUntil(
      'ready to answer 200',
      async () => {
        const current = await ready();
        return current.status === 200 && current;
      },
      { timeoutMs: 120000 },
    );
    expect(answer.body).toEqual({ status: 'ok', checks: { database: 'up', redis: 'up' } });
  }, 900_000);

  it('applies every migration in a Job that ends before the pods start', async () => {
    expect(up, 'the first up completed').toBe(true);
    const job = await kubectlJson<{ status: { succeeded: number; completionTime: string } }>([
      ...['--namespace', NAMESPACE, 'get', 'job', 'workshop-migrate'],
    ]);
    const pods = await kubectlJson<PodList>([
      ...['--namespace', NAMESPACE, 'get', 'pods'],
      ...['--selector', 'app.kubernetes.io/component=api'],
    ]);

    expect(job.status.succeeded).toBe(1);
    expect(pods.items.length).toBeGreaterThan(0);
    for (const pod of pods.items) {
      expect(
        Date.parse(pod.status.startTime),
        'a pod starts no sooner than the Job completes',
      ).toBeGreaterThanOrEqual(Date.parse(job.status.completionTime));
    }

    // The database the release names is the one of this spec, and it holds every migration.
    const settings = await kubectlJson<{ data: Record<string, string> }>([
      ...['--namespace', NAMESPACE, 'get', 'configmap', 'workshop'],
    ]);
    expect(settings.data.DATABASE_NAME).toBe(database);
    const applied = await queryDatabase<{ timestamp: string }>(
      'SELECT timestamp FROM migrations ORDER BY id',
    );
    expect(migrationTimestamps().length).toBeGreaterThan(0);
    expect(applied.map((migration) => Number(migration.timestamp))).toEqual(migrationTimestamps());
  }, 120_000);

  it('reads CPU and memory in the HPA and holds 2 replicas at rest', async () => {
    expect(up, 'the first up completed').toBe(true);

    const row = await waitUntil(
      'the HPA to show its CPU and memory targets as numbers',
      async () => {
        const table = await kubectl(['--namespace', NAMESPACE, 'get', 'hpa', 'workshop']);
        return /cpu: \d+%\/70%, memory: \d+%\/80%\s+2\s+6\s+(\d+)\s/.exec(table) ?? false;
      },
      { timeoutMs: 300000, intervalMs: 5000 },
    );
    const table = await kubectl(['--namespace', NAMESPACE, 'get', 'hpa', 'workshop']);
    const deployment = await kubectlJson<{ status: { replicas: number; readyReplicas: number } }>([
      ...['--namespace', NAMESPACE, 'get', 'deployment', 'workshop'],
    ]);

    expect(table).not.toContain('<unknown>');
    expect(Number(row[1])).toBe(2);
    expect([deployment.status.replicas, deployment.status.readyReplicas]).toEqual([2, 2]);
  }, 400_000);

  it('gives the release the secrets of .env', async () => {
    expect(up, 'the first up completed').toBe(true);
    const secret = await kubectlJson<{ data: Record<string, string> }>([
      ...['--namespace', NAMESPACE, 'get', 'secret', 'workshop'],
    ]);
    const decoded = Object.fromEntries(
      Object.entries(secret.data).map(([key, value]) => [
        key,
        Buffer.from(value, 'base64').toString('utf8'),
      ]),
    );

    expect(dotenv.DATABASE_PASSWORD.length).toBeGreaterThan(0);
    expect(dotenv.JWT_SECRET.length).toBeGreaterThanOrEqual(32);
    expect(decoded).toEqual({
      DATABASE_PASSWORD: dotenv.DATABASE_PASSWORD,
      JWT_SECRET: dotenv.JWT_SECRET,
    });
  });

  it("runs the admin seed from a pod of the image against the release's database", async () => {
    expect(up, 'the first up completed').toBe(true);
    admin = {
      email: `${randomBytes(6).toString('hex')}@example.com`,
      password: 'Str0ngPassword',
      document: uniqueValidCpf(),
    };
    const deployment = await kubectlJson<{
      spec: { template: { spec: { containers: Array<{ image: string }> } } };
    }>(['--namespace', NAMESPACE, 'get', 'deployment', 'workshop']);
    const image = deployment.spec.template.spec.containers[0].image;
    const pod = uniqueName('seed-admin');
    // The pod reads the release's settings and secrets, as the README tells the user to do in prod.
    const overrides = {
      spec: {
        containers: [
          {
            name: pod,
            image,
            imagePullPolicy: 'Never',
            command: ['node', 'dist/seed-admin.js'],
            envFrom: [{ configMapRef: { name: 'workshop' } }, { secretRef: { name: 'workshop' } }],
            env: [
              { name: 'ADMIN_EMAIL', value: admin.email },
              { name: 'ADMIN_PASSWORD', value: admin.password },
              { name: 'ADMIN_DOCUMENT', value: admin.document },
            ],
          },
        ],
      },
    };

    const result = await tool([
      ...['kubectl', 'run', pod, '--namespace', NAMESPACE, '--image', image],
      ...['--restart', 'Never', '--rm', '--attach', '--overrides', JSON.stringify(overrides)],
    ]);

    expect(result.code, lastLines(result)).toBe(0);
    const holders = await queryDatabase<{ email: string }>(
      `SELECT u.email
         FROM users u
         JOIN user_roles ur ON ur.user_id = u.id
         JOIN roles r ON r.id = ur.role_id
        WHERE r.name = 'SUPER_ADMIN'`,
    );
    expect(holders).toEqual([{ email: admin.email }]);
  }, 180_000);

  it('runs the k6 scenario with one sign-in and the board listed', async () => {
    expect(up, 'the first up completed').toBe(true);
    expect(admin, 'the admin seed ran').toBeDefined();
    const folder = join(REPOSITORY_ROOT, '.tools', 'k6');
    mkdirSync(folder, { recursive: true });
    const summaryFile = join(folder, `summary-${uniqueName('cluster')}.json`);
    cleanup.add(() => Promise.resolve(rmSync(summaryFile, { force: true })));

    const result = await tool([
      ...['k6', 'run', '--quiet', '--summary-export', summaryFile],
      ...['-e', `BASE_URL=${BASE_URL}`, '-e', `ADMIN_EMAIL=${admin.email}`],
      ...['-e', `ADMIN_PASSWORD=${admin.password}`, '-e', 'PEAK_VUS=3'],
      ...['-e', 'RAMP_UP=5s', '-e', 'HOLD=5s', '-e', 'RAMP_DOWN=2s', 'k6/board.js'],
    ]);

    expect(result.code, lastLines(result)).toBe(0);
    const summary = JSON.parse(readFileSync(summaryFile, 'utf8')) as {
      metrics: Record<string, { passes?: number; fails?: number; count?: number; value?: number }>;
      root_group: {
        checks: Record<string, { passes: number; fails: number }>;
        groups: Record<string, { checks: Record<string, { passes: number; fails: number }> }>;
      };
    };
    const board = summary.root_group.checks['board answers 200'];
    const signIn = summary.root_group.groups.setup.checks['sign-in answers 201'];

    // One sign-in, then a board listing for as long as the users stayed, all of them answered 200.
    expect(signIn).toMatchObject({ passes: 1, fails: 0 });
    expect(board.passes).toBeGreaterThan(0);
    expect(board.fails).toBe(0);
    expect(summary.metrics.checks.fails).toBe(0);
    expect(summary.metrics.http_req_failed.passes, 'no request failed').toBe(0);
    expect(
      summary.metrics.http_reqs.count,
      'the sign-in and the listings are all the requests',
    ).toBe(1 + board.passes);
    expect(summary.metrics.vus_max.value, 'the users ramped up').toBe(3);
    const sessions = await queryDatabase<{ total: string }>(
      'SELECT count(*) AS total FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.email = $1',
      [admin.email],
    );
    expect(Number(sessions[0].total), 'the account signed in once').toBe(1);
  }, 300_000);

  it('upgrades the release in place on a second up', async () => {
    expect(up, 'the first up completed').toBe(true);

    const result = await script(['up']);
    expect(result.code, lastLines(result)).toBe(0);

    expect((await docker(['inspect', '--format', '{{.Id}}', NODE])).stdout.trim()).toBe(nodeId);
    expect(await clusterNames()).toEqual([CLUSTER]);
    const release = JSON.parse(
      (await tool(['helm', 'status', 'workshop', '--namespace', NAMESPACE, '--output', 'json']))
        .stdout,
    ) as { version: number; info: { status: string } };
    expect([release.version, release.info.status]).toEqual([2, 'deployed']);
    // The rate limit the first up raised is back to the default.
    const settings = await kubectlJson<{ data: Record<string, string> }>([
      ...['--namespace', NAMESPACE, 'get', 'configmap', 'workshop'],
    ]);
    expect(settings.data).not.toHaveProperty('RATE_LIMIT_MAX_REQUESTS');
    const answer = await waitUntil(
      'ready to answer 200',
      async () => {
        const current = await ready();
        return current.status === 200 && current;
      },
      { timeoutMs: 120000 },
    );
    expect(answer.body).toEqual({ status: 'ok', checks: { database: 'up', redis: 'up' } });
  }, 900_000);

  it('deletes the cluster on down and leaves the compose containers and their data', async () => {
    expect(up, 'the first up completed').toBe(true);
    const migrationsBefore = await queryDatabase('SELECT id FROM migrations');
    const adminsBefore = await queryDatabase('SELECT id FROM users WHERE email = $1', [
      admin.email,
    ]);
    expect(migrationsBefore.length).toBeGreaterThan(0);
    expect(adminsBefore).toHaveLength(1);

    const result = await script(['down']);

    expect(result.code, lastLines(result)).toBe(0);
    expect(await clusterNames()).not.toContain(CLUSTER);
    const nodes = await docker([
      'ps',
      '--all',
      '--filter',
      `name=${NODE}`,
      '--format',
      '{{.Names}}',
    ]);
    expect(nodes.stdout.trim(), 'the node is gone').toBe('');
    expect(existsSync(KUBECONFIG), 'the kubeconfig is gone').toBe(false);
    expect(await composeIds(), 'the same containers run').toBe(composeContainers);
    expect(await queryDatabase('SELECT id FROM migrations')).toEqual(migrationsBefore);
    expect(await queryDatabase('SELECT id FROM users WHERE email = $1', [admin.email])).toEqual(
      adminsBefore,
    );
  }, 300_000);
});
