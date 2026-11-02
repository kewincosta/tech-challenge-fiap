import { randomBytes } from 'node:crypto';
import { DataSource } from 'typeorm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { databaseConfig, postgresConnection } from '../../../src/config/database.config';
import { createTestCertificates, type TestCertificates } from '../support/certificates';
import {
  buildImage,
  Cleanup,
  docker,
  publishedPort,
  TEST_LABEL,
  uniqueName,
  waitUntil,
} from '../support/docker';
import {
  createDatabase,
  databaseEnvironment,
  startPostgres,
  type ThrowawayPostgres,
} from '../support/postgres';
import { REDIS_HOST_NAME } from '../support/certificates';
import { startTlsRedis } from '../support/redis';

// The codes Node gives a server certificate it cannot trust.
const CERTIFICATE_NOT_TRUSTED =
  /^(UNABLE_TO_VERIFY_LEAF_SIGNATURE|SELF_SIGNED_CERT_IN_CHAIN|DEPTH_ZERO_SELF_SIGNED_CERT|UNABLE_TO_GET_ISSUER_CERT_LOCALLY|CERT_UNTRUSTED)$/;

const cleanup = new Cleanup();
let certificates: TestCertificates;
let network: string;
let postgres: ThrowawayPostgres;

beforeAll(async () => {
  certificates = await createTestCertificates(cleanup);
  network = uniqueName('workshop-tls-test-net');
  await docker(['network', 'create', '--label', TEST_LABEL, network]);
  cleanup.add(() => docker(['network', 'rm', network], { allowFailure: true }));
  postgres = await startPostgres({ network, cleanup, certificates: certificates.directory });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await cleanup.run();
});

/** The connection the application opens for these settings, reaching the PostgreSQL by its host port. */
function connectionFor(settings: { DATABASE_SSL?: string; DATABASE_SSL_CA?: string }): DataSource {
  vi.stubEnv('DATABASE_HOST', '127.0.0.1');
  vi.stubEnv('DATABASE_PORT', String(postgres.hostPort));
  vi.stubEnv('DATABASE_USER', postgres.user);
  vi.stubEnv('DATABASE_PASSWORD', postgres.password);
  vi.stubEnv('DATABASE_NAME', 'postgres');
  vi.stubEnv('DATABASE_SSL', settings.DATABASE_SSL);
  vi.stubEnv('DATABASE_SSL_CA', settings.DATABASE_SSL_CA);
  return new DataSource(postgresConnection(databaseConfig()));
}

async function sessionUsesTls(connection: DataSource): Promise<boolean> {
  await connection.initialize();
  try {
    const rows: Array<{ ssl: boolean }> = await connection.query(
      'SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()',
    );
    return rows[0].ssl;
  } finally {
    await connection.destroy();
  }
}

async function failureOf(connection: DataSource): Promise<{ code?: string; message: string }> {
  try {
    await connection.initialize();
  } catch (error) {
    return error as { code?: string; message: string };
  }
  await connection.destroy();
  throw new Error('The connection opened, and it should have been refused.');
}

describe('Database TLS', () => {
  it('verifies the server against the bundle DATABASE_SSL_CA names', async () => {
    const connection = connectionFor({
      DATABASE_SSL: 'true',
      DATABASE_SSL_CA: certificates.authority,
    });

    expect(await sessionUsesTls(connection)).toBe(true);
  });

  it('refuses a server signed by another authority', async () => {
    const connection = connectionFor({
      DATABASE_SSL: 'true',
      DATABASE_SSL_CA: certificates.otherAuthority,
    });

    const failure = await failureOf(connection);

    expect(failure.code, failure.message).toMatch(CERTIFICATE_NOT_TRUSTED);
  });

  it('refuses a private authority when no bundle is named', async () => {
    const connection = connectionFor({ DATABASE_SSL: 'true' });

    const failure = await failureOf(connection);

    expect(failure.code, failure.message).toMatch(CERTIFICATE_NOT_TRUSTED);
  });

  it('connects without TLS when DATABASE_SSL is unset', async () => {
    const connection = connectionFor({});

    expect(await sessionUsesTls(connection)).toBe(false);
  });
});

describe('Redis TLS', () => {
  let image: string;
  let database: string;

  beforeAll(async () => {
    image = uniqueName('workshop-tls-test');
    cleanup.add(() => docker(['rmi', '--force', image], { allowFailure: true }));
    await buildImage(image);
    await startTlsRedis({ network, cleanup, certificates: certificates.directory });
    database = await createDatabase(postgres);
  });

  /** Starts a container of the image against the TLS-only Redis, calls `inspect`, removes it. */
  async function withApplication<T>(
    settings: Record<string, string>,
    inspect: (baseUrl: string) => Promise<T>,
  ): Promise<T> {
    const container = uniqueName('workshop-infra-app');
    try {
      await docker([
        ...['run', '--detach', '--name', container, '--network', network, '--label', TEST_LABEL],
        ...['--publish', '127.0.0.1::3000', '--volume', `${certificates.directory}:/certs:ro`],
        ...Object.entries({
          ...databaseEnvironment(postgres, database),
          REDIS_HOST: REDIS_HOST_NAME,
          REDIS_PORT: '6379',
          JWT_SECRET: randomBytes(24).toString('hex'),
          SMTP_HOST: 'localhost',
          SMTP_PORT: '1025',
          MAIL_FROM: 'Oficina <no-reply@workshop.local>',
          APP_PUBLIC_URL: 'http://localhost:3000',
          OUTBOX_POLL_INTERVAL_MS: '0',
          ...settings,
        }).flatMap(([name, value]) => ['--env', `${name}=${value}`]),
        image,
      ]);
      const baseUrl = `http://127.0.0.1:${await publishedPort(container, 3000)}`;
      await waitUntil(
        `${container} to answer /health/live`,
        async () =>
          (await fetch(`${baseUrl}/health/live`, { signal: AbortSignal.timeout(5000) })).status ===
          200,
        { timeoutMs: 60000 },
      );
      return await inspect(baseUrl);
    } finally {
      await docker(['rm', '--force', container], { allowFailure: true });
    }
  }

  async function ready(baseUrl: string): Promise<{ status: number; body: unknown }> {
    const response = await fetch(`${baseUrl}/health/ready`, { signal: AbortSignal.timeout(10000) });
    return { status: response.status, body: await response.json() };
  }

  it('reaches a Redis that accepts only TLS when REDIS_TLS is true', async () => {
    const answer = await withApplication(
      { REDIS_TLS: 'true', NODE_EXTRA_CA_CERTS: '/certs/ca.crt' },
      (baseUrl) =>
        waitUntil(
          'the application to reach Redis',
          async () => {
            const answered = await ready(baseUrl);
            return answered.status === 200 && answered;
          },
          { timeoutMs: 30000 },
        ),
    );

    expect(answer.body).toEqual({ status: 'ok', checks: { database: 'up', redis: 'up' } });
  });

  it('reports redis down against that Redis when REDIS_TLS is unset', async () => {
    const answer = await withApplication({ NODE_EXTRA_CA_CERTS: '/certs/ca.crt' }, ready);

    expect(answer.status).toBe(503);
    expect(answer.body).toEqual({ status: 'error', checks: { database: 'up', redis: 'down' } });
  });

  it('reports redis down when the authority that signed the Redis is not trusted', async () => {
    const answer = await withApplication({ REDIS_TLS: 'true' }, ready);

    expect(answer.status).toBe(503);
    expect(answer.body).toEqual({ status: 'error', checks: { database: 'up', redis: 'down' } });
  });
});
