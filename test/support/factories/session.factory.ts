import { randomUUID } from 'node:crypto';
import { Session } from '../../../src/modules/authentication/domain/entities/session';
import { RefreshTokenHash } from '../../../src/modules/authentication/domain/value-objects/refresh-token-hash';
import { RefreshTokenId } from '../../../src/modules/authentication/domain/value-objects/refresh-token-id';
import { SessionId } from '../../../src/modules/authentication/domain/value-objects/session-id';

export const SESSION_NOW = new Date('2026-08-26T12:00:00.000Z');

export interface SessionFactoryOverrides {
  id?: string;
  userId?: string;
  initialTokenHash?: string;
  refreshTokenTtlSeconds?: number;
  absoluteTtlSeconds?: number;
  now?: Date;
}

export function buildSession(overrides: SessionFactoryOverrides = {}): Session {
  return Session.start({
    id: SessionId.create(overrides.id ?? randomUUID()),
    userId: overrides.userId ?? randomUUID(),
    ip: '127.0.0.1',
    userAgent: 'vitest',
    initialTokenId: RefreshTokenId.create(randomUUID()),
    initialTokenHash: RefreshTokenHash.create(overrides.initialTokenHash ?? 'hash(refresh-1)'),
    refreshTokenTtlSeconds: overrides.refreshTokenTtlSeconds ?? 604800,
    absoluteTtlSeconds: overrides.absoluteTtlSeconds ?? 2592000,
    now: overrides.now ?? SESSION_NOW,
  });
}
