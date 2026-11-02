import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TlsOptions } from 'node:tls';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { TYPEORM_MODULE_OPTIONS } from '@nestjs/typeorm/dist/typeorm.constants';
import type { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DatabaseModule } from '../shared/infrastructure/database/database.module';
import { databaseConfig, postgresConnection } from './database.config';

const BUNDLE = '-----BEGIN CERTIFICATE-----\nMIIBkTCB+wIJAL\n-----END CERTIFICATE-----\n';

let directory: string;
let bundlePath: string;

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), 'database-config-'));
  bundlePath = join(directory, 'bundle.pem');
  writeFileSync(bundlePath, BUNDLE);
});

afterAll(() => {
  rmSync(directory, { recursive: true, force: true });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function sslFor(settings: { DATABASE_SSL?: string; DATABASE_SSL_CA?: string }) {
  vi.stubEnv('DATABASE_SSL', settings.DATABASE_SSL);
  vi.stubEnv('DATABASE_SSL_CA', settings.DATABASE_SSL_CA);
  return postgresConnection(databaseConfig()).ssl;
}

// What the module hands TypeORM, read from the module as the container builds it. The data source
// that would connect is replaced, so nothing opens a connection.
async function connectionOfTheApplication(): Promise<PostgresConnectionOptions> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true, load: [databaseConfig] }),
      DatabaseModule,
    ],
  })
    .overrideProvider(getDataSourceToken())
    .useValue({ destroy: () => Promise.resolve() })
    .compile();
  try {
    return moduleRef.get<PostgresConnectionOptions>(TYPEORM_MODULE_OPTIONS, { strict: false });
  } finally {
    await moduleRef.close();
  }
}

async function connectionOfTheMigrations(): Promise<PostgresConnectionOptions> {
  vi.stubEnv('DOTENV_CONFIG_QUIET', 'true');
  vi.resetModules();
  const { default: dataSource } =
    await import('../shared/infrastructure/database/typeorm-cli.datasource');
  return dataSource.options as PostgresConnectionOptions;
}

describe('database config', () => {
  it('maps DATABASE_SSL and DATABASE_SSL_CA to the TLS options', () => {
    const withBundle = sslFor({ DATABASE_SSL: 'true', DATABASE_SSL_CA: bundlePath });
    expect(withBundle, 'true with a bundle').toMatchObject({ rejectUnauthorized: true });
    expect(String((withBundle as TlsOptions).ca), 'the bundle is the file').toBe(BUNDLE);

    expect(sslFor({ DATABASE_SSL: 'true' }), 'true with no bundle').toEqual({
      rejectUnauthorized: true,
    });
    expect(sslFor({ DATABASE_SSL: 'false', DATABASE_SSL_CA: bundlePath }), '"false"').toBeFalsy();
    expect(sslFor({}), 'unset').toBeFalsy();
  });

  it('treats an empty DATABASE_SSL_CA as no bundle', () => {
    expect(sslFor({ DATABASE_SSL: 'true', DATABASE_SSL_CA: '' })).toEqual({
      rejectUnauthorized: true,
    });
  });

  it('gives the application and the migrations the same connection options', async () => {
    vi.stubEnv('DATABASE_HOST', 'db.internal');
    vi.stubEnv('DATABASE_PORT', '6432');
    vi.stubEnv('DATABASE_USER', 'workshop-app');
    vi.stubEnv('DATABASE_PASSWORD', 'a-password');
    vi.stubEnv('DATABASE_NAME', 'workshop-prod');
    vi.stubEnv('DATABASE_SSL', 'true');
    vi.stubEnv('DATABASE_SSL_CA', bundlePath);

    const application = await connectionOfTheApplication();
    const migrations = await connectionOfTheMigrations();

    expect(application).toMatchObject({
      type: 'postgres',
      host: 'db.internal',
      port: 6432,
      username: 'workshop-app',
      password: 'a-password',
      database: 'workshop-prod',
      ssl: { rejectUnauthorized: true },
    });
    for (const connection of [application, migrations]) {
      expect(String((connection.ssl as TlsOptions).ca), 'both connect with the bundle').toBe(
        BUNDLE,
      );
    }
    for (const key of ['type', 'host', 'port', 'username', 'password', 'database'] as const) {
      expect(migrations[key], key).toEqual(application[key]);
    }
  });

  it('gives the application and the migrations no TLS when DATABASE_SSL is unset', async () => {
    vi.stubEnv('DATABASE_SSL', undefined);
    vi.stubEnv('DATABASE_SSL_CA', undefined);

    const application = await connectionOfTheApplication();
    const migrations = await connectionOfTheMigrations();

    expect(application.ssl).toBeFalsy();
    expect(migrations.ssl).toBeFalsy();
  });
});
