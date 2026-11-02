import { afterEach, describe, expect, it, vi } from 'vitest';
import { redisClientOptions, redisConfig } from './redis.config';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('redis config', () => {
  it("maps REDIS_TLS to the client's TLS option", () => {
    const examples: Array<{ label: string; REDIS_TLS: string | undefined; tls: boolean }> = [
      { label: '"true"', REDIS_TLS: 'true', tls: true },
      { label: '"false"', REDIS_TLS: 'false', tls: false },
      { label: 'unset', REDIS_TLS: undefined, tls: false },
    ];

    for (const { label, REDIS_TLS, tls } of examples) {
      vi.stubEnv('REDIS_TLS', REDIS_TLS);

      const options = redisClientOptions(redisConfig());

      if (tls) {
        expect(options.tls, label).toBeDefined();
      } else {
        expect(options, label).not.toHaveProperty('tls');
      }
    }
  });

  it('passes the host, the port and the database to the client, and gives a command two retries', () => {
    vi.stubEnv('REDIS_HOST', 'cache.internal');
    vi.stubEnv('REDIS_PORT', '6380');
    vi.stubEnv('REDIS_DB', '3');

    expect(redisClientOptions(redisConfig())).toMatchObject({
      host: 'cache.internal',
      port: 6380,
      db: 3,
      maxRetriesPerRequest: 2,
    });
  });
});
