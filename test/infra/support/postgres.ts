import { randomBytes } from 'node:crypto';
import { DataSource } from 'typeorm';
import { Cleanup, docker, publishedPort, TEST_LABEL, uniqueName, waitUntil } from './docker';

export interface ThrowawayPostgres {
  container: string;
  hostPort: number;
  user: string;
  password: string;
}

// PostgreSQL wants its key owned by its own user and closed to everyone else, which a mounted file
// is not, so the server copies the certificate and key it is given before it starts.
const START_WITH_TLS = [
  'cp /certs/postgres.crt /certs/postgres.key /var/lib/postgresql/',
  'chown postgres:postgres /var/lib/postgresql/postgres.crt /var/lib/postgresql/postgres.key',
  'chmod 600 /var/lib/postgresql/postgres.key',
  'exec docker-entrypoint.sh postgres -c ssl=on -c ssl_cert_file=/var/lib/postgresql/postgres.crt -c ssl_key_file=/var/lib/postgresql/postgres.key',
].join(' && ');

/**
 * A PostgreSQL of its own on a free host port and on `network`, where the other containers reach
 * it by its name. With `certificates` (a directory holding postgres.crt and postgres.key) it also
 * offers TLS and still accepts plain connections.
 */
export async function startPostgres(options: {
  network: string;
  cleanup: Cleanup;
  certificates?: string;
}): Promise<ThrowawayPostgres> {
  const container = uniqueName('workshop-infra-postgres');
  const user = 'workshop';
  const password = randomBytes(12).toString('hex');
  options.cleanup.add(() =>
    docker(['rm', '--force', '--volumes', container], { allowFailure: true }),
  );
  await docker([
    'run',
    '--detach',
    '--name',
    container,
    '--network',
    options.network,
    '--label',
    TEST_LABEL,
    '--env',
    `POSTGRES_USER=${user}`,
    '--env',
    `POSTGRES_PASSWORD=${password}`,
    '--publish',
    '127.0.0.1::5432',
    ...(options.certificates === undefined
      ? ['postgres:16-alpine']
      : [
          '--volume',
          `${options.certificates}:/certs:ro`,
          '--entrypoint',
          'sh',
          'postgres:16-alpine',
          '-c',
          START_WITH_TLS,
        ]),
  ]);
  const postgres: ThrowawayPostgres = {
    container,
    hostPort: await publishedPort(container, 5432),
    user,
    password,
  };
  await waitUntil(`${container} to accept connections`, async () => {
    const connection = connectionTo(postgres, 'postgres');
    await connection.initialize();
    await connection.destroy();
    return true;
  });
  return postgres;
}

/** A connection from the host to a database of the throwaway PostgreSQL, over a plain socket. */
export function connectionTo(postgres: ThrowawayPostgres, database: string): DataSource {
  return new DataSource({
    type: 'postgres',
    host: '127.0.0.1',
    port: postgres.hostPort,
    username: postgres.user,
    password: postgres.password,
    database,
  });
}

/** An empty database nobody else uses, so a spec starts from a schema of its own. */
export async function createDatabase(postgres: ThrowawayPostgres): Promise<string> {
  const name = uniqueName('workshop_infra').replace(/-/g, '_');
  const connection = connectionTo(postgres, 'postgres');
  await connection.initialize();
  try {
    await connection.query(`CREATE DATABASE "${name}"`);
  } finally {
    await connection.destroy();
  }
  return name;
}

/** The database settings of a container that connects to one of its databases by network name. */
export function databaseEnvironment(
  postgres: ThrowawayPostgres,
  database: string,
): Record<string, string> {
  return {
    DATABASE_HOST: postgres.container,
    DATABASE_PORT: '5432',
    DATABASE_USER: postgres.user,
    DATABASE_PASSWORD: postgres.password,
    DATABASE_NAME: database,
  };
}
