import { ConfigType, registerAs } from '@nestjs/config';
import type { RedisOptions } from 'ioredis';

export const redisConfig = registerAs('redis', () => ({
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
  db: Number(process.env.REDIS_DB ?? 0),
  // Only the string "true" turns TLS on, and env.validation.ts refuses every other value but "false".
  tls: process.env.REDIS_TLS === 'true',
}));

/** An empty `tls` object is TLS with the defaults of Node: the server's certificate is verified. */
export function redisClientOptions(redis: ConfigType<typeof redisConfig>): RedisOptions {
  return {
    host: redis.host,
    port: redis.port,
    db: redis.db,
    maxRetriesPerRequest: 2,
    ...(redis.tls ? { tls: {} } : {}),
  };
}
