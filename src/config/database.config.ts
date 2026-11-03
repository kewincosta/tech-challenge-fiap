import { readFileSync } from 'node:fs';
import { ConfigType, registerAs } from '@nestjs/config';
import type { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';

/**
 * The compiled migrations and the admin seed take their connection from this config and never run
 * env.validation.ts, so the values that file refuses stop here too. A value such as "TRUE" would
 * otherwise leave TLS off with no error, and a server that accepts plain connections would take it.
 */
function sslSwitch(value: string | undefined): boolean {
  if (value !== undefined && value !== 'true' && value !== 'false') {
    throw new Error(
      `Invalid environment configuration: DATABASE_SSL: expected "true" or "false", got "${value}"`,
    );
  }
  return value === 'true';
}

export const databaseConfig = registerAs('database', () => ({
  host: process.env.DATABASE_HOST ?? 'localhost',
  port: Number(process.env.DATABASE_PORT ?? 5432),
  user: process.env.DATABASE_USER ?? 'workshop',
  password: process.env.DATABASE_PASSWORD ?? 'workshop',
  name: process.env.DATABASE_NAME ?? 'workshop',
  // Only the string "true" turns TLS on, and unset or "false" leaves it off.
  ssl: sslSwitch(process.env.DATABASE_SSL),
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
