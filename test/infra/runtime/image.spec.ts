import { randomBytes, X509Certificate } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { uniqueValidCpf } from '../../support/factories/document.factory';
import {
  buildImage,
  Cleanup,
  docker,
  REPOSITORY_ROOT,
  TEST_LABEL,
  uniqueName,
  type CommandResult,
} from '../support/docker';
import {
  connectionTo,
  createDatabase,
  databaseEnvironment,
  startPostgres,
  type ThrowawayPostgres,
} from '../support/postgres';

const MIGRATIONS = join(REPOSITORY_ROOT, 'src/shared/infrastructure/database/migrations');

const cleanup = new Cleanup();
let image: string;
let network: string;
let postgres: ThrowawayPostgres;

beforeAll(async () => {
  image = uniqueName('workshop-image-test');
  cleanup.add(() => docker(['rmi', '--force', image], { allowFailure: true }));
  await buildImage(image);

  network = uniqueName('workshop-image-test-net');
  await docker(['network', 'create', '--label', TEST_LABEL, network]);
  cleanup.add(() => docker(['network', 'rm', network], { allowFailure: true }));

  postgres = await startPostgres({ network, cleanup });
});

afterAll(async () => {
  await cleanup.run();
});

/** Runs a command in a container of the image, on the network of the throwaway PostgreSQL. */
function runInImage(command: string[], environment: Record<string, string> = {}) {
  return docker(
    [
      'run',
      '--rm',
      '--network',
      network,
      '--label',
      TEST_LABEL,
      ...Object.entries(environment).flatMap(([name, value]) => ['--env', `${name}=${value}`]),
      image,
      ...command,
    ],
    { allowFailure: true },
  );
}

function expectSuccess(result: CommandResult, what: string): void {
  expect(result.code, `${what}: ${result.stdout}${result.stderr}`).toBe(0);
}

/** The timestamps the files under src/shared/infrastructure/database/migrations are named with. */
function migrationTimestamps(): number[] {
  return readdirSync(MIGRATIONS)
    .filter((file) => /^\d+-.+\.ts$/.test(file))
    .map((file) => Number(file.split('-')[0]))
    .sort((a, b) => a - b);
}

async function appliedMigrations(
  database: string,
): Promise<Array<{ id: number; timestamp: number }>> {
  const connection = connectionTo(postgres, database);
  await connection.initialize();
  try {
    const rows: Array<{ id: number; timestamp: string }> = await connection.query(
      'SELECT id, timestamp FROM migrations ORDER BY id',
    );
    return rows.map((row) => ({ id: row.id, timestamp: Number(row.timestamp) }));
  } finally {
    await connection.destroy();
  }
}

describe('Production image', () => {
  it('applies every migration to an empty database with node', async () => {
    const database = await createDatabase(postgres);
    const environment = databaseEnvironment(postgres, database);

    expectSuccess(await runInImage(['node', 'dist/migrate.js'], environment), 'first run');
    const afterFirstRun = await appliedMigrations(database);
    expectSuccess(await runInImage(['node', 'dist/migrate.js'], environment), 'second run');
    const afterSecondRun = await appliedMigrations(database);

    expect(migrationTimestamps().length, 'the repository holds migrations').toBeGreaterThan(0);
    expect(afterFirstRun.map((migration) => migration.timestamp)).toEqual(migrationTimestamps());
    expect(afterSecondRun, 'the second run applies none').toEqual(afterFirstRun);
  });

  it('runs the admin seed twice and leaves one super administrator', async () => {
    const database = await createDatabase(postgres);
    const environment = {
      ...databaseEnvironment(postgres, database),
      ADMIN_EMAIL: `${randomBytes(6).toString('hex')}@example.com`,
      ADMIN_PASSWORD: 'Str0ngPassword',
      ADMIN_DOCUMENT: uniqueValidCpf(),
    };
    expectSuccess(await runInImage(['node', 'dist/migrate.js'], environment), 'migrations');

    expectSuccess(await runInImage(['node', 'dist/seed-admin.js'], environment), 'first seed');
    expectSuccess(await runInImage(['node', 'dist/seed-admin.js'], environment), 'second seed');

    const connection = connectionTo(postgres, database);
    await connection.initialize();
    try {
      const holders: Array<{ email: string }> = await connection.query(
        `SELECT u.email
           FROM users u
           JOIN user_roles ur ON ur.user_id = u.id
           JOIN roles r ON r.id = ur.role_id
          WHERE r.name = 'SUPER_ADMIN'`,
      );
      expect(holders).toEqual([{ email: environment.ADMIN_EMAIL }]);
    } finally {
      await connection.destroy();
    }
  });

  it('runs as a non-root user with no development tooling', async () => {
    const configuredUser = (
      await docker(['image', 'inspect', '--format', '{{.Config.User}}', image])
    ).stdout.trim();
    const runtimeUser = (await runInImage(['id', '-u'])).stdout.trim();
    const tooling = await runInImage([
      'find',
      '/app/node_modules',
      '(',
      '-name',
      'ts-node',
      '-o',
      '-name',
      'typescript',
      ')',
    ]);

    expect(['', 'root', '0']).not.toContain(configuredUser);
    expect(runtimeUser).toMatch(/^[1-9]\d*$/);
    expect(tooling.code).toBe(0);
    expect(tooling.stdout.trim(), 'ts-node and typescript are not in node_modules').toBe('');
  });

  it('carries the RDS certificate bundle the prod values name', async () => {
    const values = parse(
      readFileSync(join(REPOSITORY_ROOT, 'k8s/workshop/values-prod.yaml'), 'utf8'),
    ) as {
      config: { DATABASE_SSL_CA: string };
    };
    const bundle = values.config.DATABASE_SSL_CA;

    const file = await runInImage(['cat', bundle]);
    const certificates =
      file.stdout.match(/-----BEGIN CERTIFICATE-----[^-]+-----END CERTIFICATE-----/g) ?? [];

    expect(bundle, 'the prod values name a bundle').toMatch(/^\/.+\.pem$/);
    expectSuccess(file, `reading ${bundle}`);
    expect(certificates.length, 'a bundle holds more than one certificate').toBeGreaterThan(1);
    for (const certificate of certificates) {
      expect(new X509Certificate(certificate).subject, 'each block is a certificate').not.toBe('');
    }
  });
});
