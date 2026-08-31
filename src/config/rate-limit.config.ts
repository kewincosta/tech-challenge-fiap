import { registerAs } from '@nestjs/config';

export const rateLimitConfig = registerAs('rateLimit', () => ({
  ttlSeconds: Number(process.env.RATE_LIMIT_TTL_SECONDS ?? 60),
  maxRequests: Number(process.env.RATE_LIMIT_MAX_REQUESTS ?? 100),
  authMaxRequests: Number(process.env.RATE_LIMIT_AUTH_MAX_REQUESTS ?? 10),
}));

export function authThrottle(): { limit: number; ttl: number } {
  return {
    limit: Number(process.env.RATE_LIMIT_AUTH_MAX_REQUESTS ?? 10),
    ttl: Number(process.env.RATE_LIMIT_TTL_SECONDS ?? 60) * 1000,
  };
}
