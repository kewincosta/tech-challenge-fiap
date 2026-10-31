import { registerAs } from '@nestjs/config';

export const outboxConfig = registerAs('outbox', () => ({
  pollIntervalMs: Number(process.env.OUTBOX_POLL_INTERVAL_MS ?? 5000),
  graceSeconds: Number(process.env.OUTBOX_GRACE_SECONDS ?? 300),
  maxAttempts: Number(process.env.OUTBOX_MAX_ATTEMPTS ?? 10),
}));
