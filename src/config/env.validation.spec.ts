import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.validation';

const REQUIRED = {
  DATABASE_HOST: 'localhost',
  DATABASE_USER: 'workshop',
  DATABASE_PASSWORD: 'workshop',
  DATABASE_NAME: 'workshop',
  REDIS_HOST: 'localhost',
  JWT_SECRET: 'a-secret-of-at-least-thirty-two-characters',
};

describe('validateEnv outbox settings', () => {
  it('defaults the poll interval to 5000 milliseconds, the grace period to 300 seconds and the attempt limit to 10', () => {
    const env = validateEnv(REQUIRED);

    expect([
      env.OUTBOX_POLL_INTERVAL_MS,
      env.OUTBOX_GRACE_SECONDS,
      env.OUTBOX_MAX_ATTEMPTS,
    ]).toEqual([5000, 300, 10]);
  });

  it('reads the three settings from strings, the way the environment holds them', () => {
    const env = validateEnv({
      ...REQUIRED,
      OUTBOX_POLL_INTERVAL_MS: '2000',
      OUTBOX_GRACE_SECONDS: '60',
      OUTBOX_MAX_ATTEMPTS: '4',
    });

    expect([
      env.OUTBOX_POLL_INTERVAL_MS,
      env.OUTBOX_GRACE_SECONDS,
      env.OUTBOX_MAX_ATTEMPTS,
    ]).toEqual([2000, 60, 4]);
  });

  it('accepts an interval of 0, which turns the processor off', () => {
    expect(validateEnv({ ...REQUIRED, OUTBOX_POLL_INTERVAL_MS: '0' }).OUTBOX_POLL_INTERVAL_MS).toBe(
      0,
    );
  });

  it.each([
    ['OUTBOX_POLL_INTERVAL_MS', '-1'],
    ['OUTBOX_POLL_INTERVAL_MS', 'often'],
    ['OUTBOX_GRACE_SECONDS', '0'],
    ['OUTBOX_GRACE_SECONDS', '1.5'],
    ['OUTBOX_MAX_ATTEMPTS', '0'],
    ['OUTBOX_MAX_ATTEMPTS', 'many'],
  ])('refuses %s set to %s', (name, value) => {
    expect(() => validateEnv({ ...REQUIRED, [name]: value })).toThrow(
      /Invalid environment configuration/,
    );
  });
});
