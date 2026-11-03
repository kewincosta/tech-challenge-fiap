import { copyFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  Cleanup,
  docker,
  freePort,
  REPOSITORY_ROOT,
  uniqueName,
  waitUntil,
  type CommandResult,
} from '../support/docker';

const cleanup = new Cleanup();
let project: string;
let environment: NodeJS.ProcessEnv;
let appPort: number;

beforeAll(async () => {
  project = uniqueName('workshop-compose-test');

  // The app service reads .env. A clone with no .env gets the example for the length of the run.
  const dotenv = join(REPOSITORY_ROOT, '.env');
  if (!existsSync(dotenv)) {
    copyFileSync(join(REPOSITORY_ROOT, '.env.example'), dotenv);
    cleanup.add(() => Promise.resolve(rmSync(dotenv, { force: true })));
  }

  // Free host ports and a project of its own: the stack never meets the developer's containers.
  const ports = new Set<number>();
  while (ports.size < 5) {
    ports.add(await freePort());
  }
  const [app, postgres, redis, mailpitSmtp, mailpitUi] = [...ports];
  appPort = app;
  environment = {
    ...process.env,
    APP_HOST_PORT: String(app),
    POSTGRES_HOST_PORT: String(postgres),
    REDIS_HOST_PORT: String(redis),
    MAILPIT_SMTP_HOST_PORT: String(mailpitSmtp),
    MAILPIT_UI_HOST_PORT: String(mailpitUi),
  };
  cleanup.add(() =>
    compose(['down', '--volumes', '--rmi', 'local', '--remove-orphans'], { allowFailure: true }),
  );
});

afterAll(async () => {
  await cleanup.run();
});

function compose(args: string[], options: { allowFailure?: boolean } = {}): Promise<CommandResult> {
  return docker(['compose', '--project-name', project, ...args], {
    cwd: REPOSITORY_ROOT,
    env: environment,
    ...options,
  });
}

interface Health {
  Status: string;
  Log: Array<{ ExitCode: number }>;
}

async function appHealth(): Promise<Health> {
  const container = (await compose(['ps', '--quiet', 'app'])).stdout.trim();
  const { stdout } = await docker(['inspect', '--format', '{{json .State.Health}}', container]);
  return JSON.parse(stdout) as Health;
}

async function readyStatus(): Promise<number> {
  try {
    return (await fetch(`http://127.0.0.1:${appPort}/health/ready`)).status;
  } catch {
    return 0;
  }
}

describe('Compose stack', () => {
  it('reports the app healthy only while ready answers 200', async () => {
    // The app starts while Redis is down, so its ready route answers 503 for as long as we choose.
    await compose(['up', '--detach', '--wait', 'postgres', 'redis', 'mailpit']);
    await compose(['stop', 'redis']);
    await compose(['up', '--detach', '--build', '--no-deps', 'app']);

    const startingWhileUnready = await waitUntil(
      'a failed health check of the app',
      async () => {
        const health = await appHealth();
        return health.Log.some((check) => check.ExitCode !== 0) && health;
      },
      { timeoutMs: 60000, intervalMs: 1000 },
    );
    expect(await readyStatus(), 'ready answers 503 with Redis down').toBe(503);
    expect(startingWhileUnready.Status, 'a failed check leaves the app starting').toBe('starting');

    await compose(['start', 'redis']);
    await waitUntil('ready to answer 200', async () => (await readyStatus()) === 200, {
      timeoutMs: 60000,
    });
    const healthy = await waitUntil(
      'the app to report healthy',
      async () => {
        const health = await appHealth();
        return health.Status === 'healthy' && health;
      },
      { timeoutMs: 60000, intervalMs: 1000 },
    );
    expect(healthy.Log.at(-1)?.ExitCode, 'the last check passed').toBe(0);

    await compose(['stop', 'redis']);
    const unhealthy = await waitUntil(
      'the app to report unhealthy',
      async () => {
        const health = await appHealth();
        return health.Status === 'unhealthy' && health;
      },
      { timeoutMs: 120000, intervalMs: 2000 },
    );
    expect(await readyStatus(), 'ready answers 503 once Redis stops').toBe(503);
    expect(unhealthy.Log.at(-1)?.ExitCode, 'the last check failed').not.toBe(0);
  });
});
