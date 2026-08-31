import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  buildSession,
  SESSION_NOW,
} from '../../../../../test/support/factories/session.factory';
import { RefreshTokenReuseError } from '../errors/refresh-token-reuse.error';
import { SessionNotActiveError } from '../errors/session-not-active.error';
import { RefreshTokenReuseDetected } from '../events/refresh-token-reuse-detected.event';
import { RefreshTokenRotated } from '../events/refresh-token-rotated.event';
import { SessionRevoked } from '../events/session-revoked.event';
import { InvalidRefreshTokenError } from '../errors/invalid-refresh-token.error';
import { RefreshTokenStatus } from '../refresh-token-status';
import { SessionRevocationReason } from '../session-revocation-reason';
import { SessionStatus } from '../session-status';
import { RefreshTokenHash } from '../value-objects/refresh-token-hash';
import { RefreshTokenId } from '../value-objects/refresh-token-id';

function minutesAfter(base: Date, minutes: number): Date {
  return new Date(base.getTime() + minutes * 60000);
}

describe('Session', () => {
  it('should start with a single active refresh token', () => {
    const session = buildSession();

    expect(session.status).toBe(SessionStatus.Active);
    expect(session.tokens).toHaveLength(1);
    expect(session.activeToken.status).toBe(RefreshTokenStatus.Active);
  });

  it('should limit the refresh token expiration by the absolute session expiration', () => {
    const session = buildSession({ refreshTokenTtlSeconds: 604800, absoluteTtlSeconds: 3600 });

    expect(session.activeToken.expiresAt).toEqual(session.absoluteExpiresAt);
  });

  it('should rotate the refresh token keeping the chain', () => {
    const session = buildSession();
    const previousToken = session.activeToken;
    const newTokenId = RefreshTokenId.create(randomUUID());

    session.rotateRefreshToken({
      presentedTokenHash: RefreshTokenHash.create('hash(refresh-1)'),
      newTokenId,
      newTokenHash: RefreshTokenHash.create('hash(refresh-2)'),
      refreshTokenTtlSeconds: 604800,
      now: minutesAfter(SESSION_NOW, 10),
    });

    expect(previousToken.status).toBe(RefreshTokenStatus.Rotated);
    expect(previousToken.replacedById).toBe(newTokenId.value);
    expect(session.activeToken.id.equals(newTokenId)).toBe(true);
    expect(session.lastUsedAt).toEqual(minutesAfter(SESSION_NOW, 10));
    expect(
      session.pullDomainEvents().some((event) => event instanceof RefreshTokenRotated),
    ).toBe(true);
  });

  it('should revoke the whole session when a rotated token is presented again', () => {
    const session = buildSession();
    session.rotateRefreshToken({
      presentedTokenHash: RefreshTokenHash.create('hash(refresh-1)'),
      newTokenId: RefreshTokenId.create(randomUUID()),
      newTokenHash: RefreshTokenHash.create('hash(refresh-2)'),
      refreshTokenTtlSeconds: 604800,
      now: minutesAfter(SESSION_NOW, 10),
    });

    expect(() =>
      session.rotateRefreshToken({
        presentedTokenHash: RefreshTokenHash.create('hash(refresh-1)'),
        newTokenId: RefreshTokenId.create(randomUUID()),
        newTokenHash: RefreshTokenHash.create('hash(refresh-3)'),
        refreshTokenTtlSeconds: 604800,
        now: minutesAfter(SESSION_NOW, 20),
      }),
    ).toThrow(RefreshTokenReuseError);

    expect(session.status).toBe(SessionStatus.Revoked);
    expect(session.revocationReason).toBe(SessionRevocationReason.TokenReuse);
    const events = session.pullDomainEvents();
    expect(events.some((event) => event instanceof RefreshTokenReuseDetected)).toBe(true);
    expect(events.some((event) => event instanceof SessionRevoked)).toBe(true);
  });

  it('should not rotate an expired refresh token', () => {
    const session = buildSession({ refreshTokenTtlSeconds: 60 });

    expect(() =>
      session.rotateRefreshToken({
        presentedTokenHash: RefreshTokenHash.create('hash(refresh-1)'),
        newTokenId: RefreshTokenId.create(randomUUID()),
        newTokenHash: RefreshTokenHash.create('hash(refresh-2)'),
        refreshTokenTtlSeconds: 60,
        now: minutesAfter(SESSION_NOW, 10),
      }),
    ).toThrow(InvalidRefreshTokenError);
    expect(session.status).toBe(SessionStatus.Active);
  });

  it('should not rotate a revoked session', () => {
    const session = buildSession();
    session.revoke(SessionRevocationReason.Logout, minutesAfter(SESSION_NOW, 5));

    expect(() =>
      session.rotateRefreshToken({
        presentedTokenHash: RefreshTokenHash.create('hash(refresh-1)'),
        newTokenId: RefreshTokenId.create(randomUUID()),
        newTokenHash: RefreshTokenHash.create('hash(refresh-2)'),
        refreshTokenTtlSeconds: 604800,
        now: minutesAfter(SESSION_NOW, 10),
      }),
    ).toThrow(SessionNotActiveError);
  });

  it('should not rotate past the absolute session expiration', () => {
    const session = buildSession({ absoluteTtlSeconds: 60 });

    expect(() =>
      session.rotateRefreshToken({
        presentedTokenHash: RefreshTokenHash.create('hash(refresh-1)'),
        newTokenId: RefreshTokenId.create(randomUUID()),
        newTokenHash: RefreshTokenHash.create('hash(refresh-2)'),
        refreshTokenTtlSeconds: 604800,
        now: minutesAfter(SESSION_NOW, 10),
      }),
    ).toThrow(SessionNotActiveError);
  });

  it('should revoke idempotently and revoke the active tokens', () => {
    const session = buildSession();

    session.revoke(SessionRevocationReason.Logout, minutesAfter(SESSION_NOW, 5));
    session.revoke(SessionRevocationReason.LogoutAll, minutesAfter(SESSION_NOW, 6));

    expect(session.status).toBe(SessionStatus.Revoked);
    expect(session.revocationReason).toBe(SessionRevocationReason.Logout);
    expect(session.tokens[0].status).toBe(RefreshTokenStatus.Revoked);
    const revocations = session
      .pullDomainEvents()
      .filter((event) => event instanceof SessionRevoked);
    expect(revocations).toHaveLength(1);
  });
});
