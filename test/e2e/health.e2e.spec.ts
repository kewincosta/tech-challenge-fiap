import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestApp, type TestApp } from '../support/app';
import { api } from '../support/http';
import { startTcpProxy, type TcpProxy } from '../support/tcp-proxy';

const RATE_LIMIT = 5;

let testApp: TestApp;
let databaseProxy: TcpProxy;
let redisProxy: TcpProxy;

// The application under test reaches the database and Redis through relays of its own, so a test
// can make either one unreachable without touching the containers every other suite shares. The
// rate limit is small, so a test passes it in a few calls.
beforeEach(async () => {
  databaseProxy = await startTcpProxy({
    host: process.env.DATABASE_HOST!,
    port: Number(process.env.DATABASE_PORT),
  });
  redisProxy = await startTcpProxy({
    host: process.env.REDIS_HOST!,
    port: Number(process.env.REDIS_PORT),
  });
  vi.stubEnv('DATABASE_HOST', databaseProxy.host);
  vi.stubEnv('DATABASE_PORT', String(databaseProxy.port));
  vi.stubEnv('REDIS_HOST', redisProxy.host);
  vi.stubEnv('REDIS_PORT', String(redisProxy.port));
  vi.stubEnv('RATE_LIMIT_MAX_REQUESTS', String(RATE_LIMIT));
  try {
    testApp = await createTestApp();
  } finally {
    vi.unstubAllEnvs();
  }
});

afterEach(async () => {
  await testApp.close();
  await Promise.all([databaseProxy.cut(), redisProxy.cut()]);
});

describe('Health endpoints', () => {
  it('answers live with 200 and status ok with no token', async () => {
    const response = await api(testApp.app).get('/health/live').expect(200);

    expect(response.body).toEqual({ status: 'ok' });
  });

  it('answers live beyond the rate limit', async () => {
    for (let call = 1; call <= RATE_LIMIT + 1; call += 1) {
      const response = await api(testApp.app).get('/health/live');

      expect(response.status, `call ${call} of a limit of ${RATE_LIMIT}`).toBe(200);
    }
  });

  it('answers ready beyond the rate limit', async () => {
    for (let call = 1; call <= RATE_LIMIT + 1; call += 1) {
      const response = await api(testApp.app).get('/health/ready');

      expect(response.status, `call ${call} of a limit of ${RATE_LIMIT}`).toBe(200);
    }
  });

  it('answers ready with 200 when the database and Redis answer', async () => {
    const response = await api(testApp.app).get('/health/ready').expect(200);

    expect(response.body).toEqual({ status: 'ok', checks: { database: 'up', redis: 'up' } });
  });

  it('answers ready with 503 and redis down when Redis is unreachable', async () => {
    await redisProxy.cut();

    const response = await api(testApp.app).get('/health/ready').expect(503);

    expect(response.body).toEqual({ status: 'error', checks: { database: 'up', redis: 'down' } });
  });

  it('answers ready with 503 and database down when the database is unreachable', async () => {
    await databaseProxy.cut();

    const response = await api(testApp.app).get('/health/ready').expect(503);

    expect(response.body).toEqual({ status: 'error', checks: { database: 'down', redis: 'up' } });
  });

  it('answers ready with 503 and both down when neither is reachable', async () => {
    await Promise.all([databaseProxy.cut(), redisProxy.cut()]);

    const response = await api(testApp.app).get('/health/ready').expect(503);

    expect(response.body).toEqual({
      status: 'error',
      checks: { database: 'down', redis: 'down' },
    });
  });

  it('answers ready with 503 after 2 seconds when the database takes the query and never answers', async () => {
    databaseProxy.stall();
    const startedAt = Date.now();

    try {
      const response = await api(testApp.app).get('/health/ready').expect(503);

      const elapsed = Date.now() - startedAt;
      expect(response.body).toEqual({ status: 'error', checks: { database: 'down', redis: 'up' } });
      expect(elapsed).toBeGreaterThanOrEqual(1950);
      expect(elapsed).toBeLessThan(3500);
    } finally {
      // The query the database never answered keeps its connection busy, and closing the pool waits for it.
      await databaseProxy.cut();
    }
  });

  it('answers live while the database and Redis are unreachable', async () => {
    await Promise.all([databaseProxy.cut(), redisProxy.cut()]);

    const response = await api(testApp.app).get('/health/live').expect(200);

    expect(response.body).toEqual({ status: 'ok' });
  });

  it('serves the probes outside the API prefix and its version', async () => {
    for (const path of ['/api/health/live', '/api/v1/health/live', '/api/v1/health/ready']) {
      const response = await api(testApp.app).get(path);

      expect(response.status, path).toBe(404);
    }
  });
});
