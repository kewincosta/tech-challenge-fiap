import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_HOST: z.string().min(1),
  DATABASE_PORT: z.coerce.number().int().positive().default(5432),
  DATABASE_USER: z.string().min(1),
  DATABASE_PASSWORD: z.string().min(1),
  DATABASE_NAME: z.string().min(1),
  // An enum, not z.coerce.boolean(): that turns the string "false" into true.
  DATABASE_SSL: z.enum(['true', 'false']).optional(),
  DATABASE_SSL_CA: z.string().optional(),
  REDIS_HOST: z.string().min(1),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_DB: z.coerce.number().int().min(0).max(15).default(0),
  REDIS_HOST_PORT: z.coerce.number().int().positive().optional(),
  REDIS_TLS: z.enum(['true', 'false']).optional(),
  JWT_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(604800),
  SESSION_ABSOLUTE_TTL_SECONDS: z.coerce.number().int().positive().default(2592000),
  RATE_LIMIT_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_AUTH_MAX_REQUESTS: z.coerce.number().int().positive().default(10),
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().min(0).default(5000),
  OUTBOX_GRACE_SECONDS: z.coerce.number().int().positive().default(300),
  OUTBOX_MAX_ATTEMPTS: z.coerce.number().int().positive().default(10),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().min(1),
  APP_PUBLIC_URL: z.url({ protocol: /^https?$/ }),
  ADMIN_EMAIL: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),
});

export type EnvVars = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): EnvVars {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  return result.data;
}
