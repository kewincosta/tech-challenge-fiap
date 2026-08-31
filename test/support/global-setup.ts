import { resolve } from 'node:path';
import { config } from 'dotenv';
import Redis from 'ioredis';
import { DataSource } from 'typeorm';
import { CreateIdentityAndAccessSchema1787702400000 } from '../../src/shared/infrastructure/database/migrations/1787702400000-create-identity-and-access-schema';
import { SeedRbacCatalog1787702400001 } from '../../src/shared/infrastructure/database/migrations/1787702400001-seed-rbac-catalog';
import { CreateCustomersTable1787702400002 } from '../../src/shared/infrastructure/database/migrations/1787702400002-create-customers-table';
import { CreateVehiclesTable1787702400003 } from '../../src/shared/infrastructure/database/migrations/1787702400003-create-vehicles-table';
import { CreateServicesTable1787702400004 } from '../../src/shared/infrastructure/database/migrations/1787702400004-create-services-table';

const TEST_DATABASE_SUFFIX = '_test';

export default async function globalSetup(): Promise<void> {
  config({ path: resolve(__dirname, '../../.env.test'), override: true, quiet: true });
  assertDedicatedTestDatabase();
  await assertStandaloneRedis();
  await runMigrations();
}

function assertDedicatedTestDatabase(): void {
  const database = process.env.DATABASE_NAME ?? '';
  if (!database.endsWith(TEST_DATABASE_SUFFIX)) {
    throw new Error(
      `Refusing to run tests against database "${database}". ` +
        `DATABASE_NAME must end with "${TEST_DATABASE_SUFFIX}".`,
    );
  }
}

async function assertStandaloneRedis(): Promise<void> {
  const host = process.env.REDIS_HOST ?? '';
  const port = Number(process.env.REDIS_PORT);
  const redis = new Redis({ host, port, lazyConnect: true, maxRetriesPerRequest: 1 });
  try {
    await redis.connect();
    const info = await redis.info('cluster');
    if (!info.includes('cluster_enabled:0')) {
      throw new Error(
        `Refusing to run tests against the Redis at ${host}:${port}: it reports cluster mode. ` +
          `The expected target is the standalone container from this project's docker-compose.`,
      );
    }
  } finally {
    redis.disconnect();
  }
}

async function runMigrations(): Promise<void> {
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT),
    username: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    migrations: [
      CreateIdentityAndAccessSchema1787702400000,
      SeedRbacCatalog1787702400001,
      CreateCustomersTable1787702400002,
      CreateVehiclesTable1787702400003,
      CreateServicesTable1787702400004,
    ],
  });
  await dataSource.initialize();
  try {
    await dataSource.runMigrations();
  } finally {
    await dataSource.destroy();
  }
}
