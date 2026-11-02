import { readFileSync } from 'node:fs';
import { ConfigType, registerAs } from '@nestjs/config';
import type { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';

export const databaseConfig = registerAs('database', () => ({
  host: process.env.DATABASE_HOST ?? 'localhost',
  port: Number(process.env.DATABASE_PORT ?? 5432),
  user: process.env.DATABASE_USER ?? 'workshop',
  password: process.env.DATABASE_PASSWORD ?? 'workshop',
  name: process.env.DATABASE_NAME ?? 'workshop',
  // Only the string "true" turns TLS on, and env.validation.ts refuses every other value but "false".
  ssl: process.env.DATABASE_SSL === 'true',
  // The file of certificate authorities the server's certificate is checked against. An empty value
  // in a dotenv file means "none", the same as a missing one.
  sslCa: process.env.DATABASE_SSL_CA || undefined,
}));

/**
 * The connection to PostgreSQL, for the application and for the data source of the migrations and
 * the admin seed alike. With TLS on, the server's certificate is always verified: against the file
 * `sslCa` names, or against the authorities Node already trusts when there is none.
 */
export function postgresConnection(
  db: ConfigType<typeof databaseConfig>,
): PostgresConnectionOptions {
  return {
    type: 'postgres',
    host: db.host,
    port: db.port,
    username: db.user,
    password: db.password,
    database: db.name,
    ssl: db.ssl
      ? { rejectUnauthorized: true, ...(db.sslCa ? { ca: readFileSync(db.sslCa) } : {}) }
      : false,
  };
}
