import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.validation';

const REQUIRED = {
  DATABASE_HOST: 'localhost',
  DATABASE_USER: 'workshop',
  DATABASE_PASSWORD: 'workshop',
  DATABASE_NAME: 'workshop',
  REDIS_HOST: 'localhost',
  JWT_SECRET: 'a-secret-of-at-least-thirty-two-characters',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  MAIL_FROM: 'Oficina <no-reply@workshop.local>',
  APP_PUBLIC_URL: 'http://localhost:13000',
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

describe('mail settings', () => {
  const MAIL_AND_URL = ['SMTP_HOST', 'SMTP_PORT', 'MAIL_FROM', 'APP_PUBLIC_URL'] as const;

  it('requires the mail settings and the public URL', () => {
    expect(validateEnv(REQUIRED)).toMatchObject({
      SMTP_HOST: 'localhost',
      SMTP_PORT: 1025,
      MAIL_FROM: 'Oficina <no-reply@workshop.local>',
      APP_PUBLIC_URL: 'http://localhost:13000',
    });
    for (const name of MAIL_AND_URL) {
      const without: Record<string, string> = { ...REQUIRED };
      delete without[name];

      expect(() => validateEnv(without), `${name} missing`).toThrow(
        new RegExp(`Invalid environment configuration: .*${name}`),
      );
    }
  });

  it('leaves the login of the mail server optional', () => {
    const env = validateEnv({ ...REQUIRED, SMTP_USER: 'oficina', SMTP_PASSWORD: 'secret' });

    expect([env.SMTP_USER, env.SMTP_PASSWORD]).toEqual(['oficina', 'secret']);
    expect([validateEnv(REQUIRED).SMTP_USER, validateEnv(REQUIRED).SMTP_PASSWORD]).toEqual([
      undefined,
      undefined,
    ]);
  });

  it.each([
    ['SMTP_PORT', 'smtp'],
    ['SMTP_PORT', '0'],
    ['SMTP_HOST', ''],
    ['MAIL_FROM', ''],
    ['APP_PUBLIC_URL', 'localhost:13000'],
    ['APP_PUBLIC_URL', 'ftp://oficina.example.com'],
    ['APP_PUBLIC_URL', ''],
  ])('refuses %s set to "%s"', (name, value) => {
    expect(() => validateEnv({ ...REQUIRED, [name]: value })).toThrow(
      /Invalid environment configuration/,
    );
  });
});

describe('TLS settings', () => {
  it('leaves DATABASE_SSL, DATABASE_SSL_CA and REDIS_TLS optional', () => {
    const env = validateEnv(REQUIRED);

    expect([env.DATABASE_SSL, env.DATABASE_SSL_CA, env.REDIS_TLS]).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
  });

  it('keeps "true" and "false" as the strings they are, so "false" never reads as true', () => {
    const on = validateEnv({ ...REQUIRED, DATABASE_SSL: 'true', REDIS_TLS: 'true' });
    const off = validateEnv({ ...REQUIRED, DATABASE_SSL: 'false', REDIS_TLS: 'false' });

    expect([on.DATABASE_SSL, on.REDIS_TLS]).toEqual(['true', 'true']);
    expect([off.DATABASE_SSL, off.REDIS_TLS]).toEqual(['false', 'false']);
  });

  it('reads the bundle of the database as a path', () => {
    const env = validateEnv({ ...REQUIRED, DATABASE_SSL_CA: '/app/certs/rds-global-bundle.pem' });

    expect(env.DATABASE_SSL_CA).toBe('/app/certs/rds-global-bundle.pem');
  });

  it.each([
    ['DATABASE_SSL', 'yes'],
    ['DATABASE_SSL', '1'],
    ['DATABASE_SSL', 'TRUE'],
    ['DATABASE_SSL', ''],
    ['REDIS_TLS', 'on'],
    ['REDIS_TLS', '0'],
    ['REDIS_TLS', ''],
  ])('refuses %s set to "%s", which would leave TLS off without saying so', (name, value) => {
    expect(() => validateEnv({ ...REQUIRED, [name]: value })).toThrow(
      new RegExp(`Invalid environment configuration: .*${name}`),
    );
  });
});
