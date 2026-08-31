import { AggregateRoot } from '../../../../shared/domain/aggregate-root';
import { InvalidRefreshTokenError } from '../errors/invalid-refresh-token.error';
import { RefreshTokenReuseError } from '../errors/refresh-token-reuse.error';
import { SessionNotActiveError } from '../errors/session-not-active.error';
import { RefreshTokenReuseDetected } from '../events/refresh-token-reuse-detected.event';
import { RefreshTokenRotated } from '../events/refresh-token-rotated.event';
import { SessionCreated } from '../events/session-created.event';
import { SessionRevoked } from '../events/session-revoked.event';
import { SessionRevocationReason } from '../session-revocation-reason';
import { SessionStatus } from '../session-status';
import { RefreshTokenHash } from '../value-objects/refresh-token-hash';
import { RefreshTokenId } from '../value-objects/refresh-token-id';
import { SessionId } from '../value-objects/session-id';
import { RefreshToken } from './refresh-token';

interface SessionProps {
  id: SessionId;
  userId: string;
  status: SessionStatus;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
  lastUsedAt: Date;
  absoluteExpiresAt: Date;
  revokedAt: Date | null;
  revocationReason: SessionRevocationReason | null;
  tokens: RefreshToken[];
}

interface StartSessionInput {
  id: SessionId;
  userId: string;
  ip: string | null;
  userAgent: string | null;
  initialTokenId: RefreshTokenId;
  initialTokenHash: RefreshTokenHash;
  refreshTokenTtlSeconds: number;
  absoluteTtlSeconds: number;
  now: Date;
}

interface RotateRefreshTokenInput {
  presentedTokenHash: RefreshTokenHash;
  newTokenId: RefreshTokenId;
  newTokenHash: RefreshTokenHash;
  refreshTokenTtlSeconds: number;
  now: Date;
}

export class Session extends AggregateRoot {
  private constructor(private readonly props: SessionProps) {
    super();
  }

  static start(input: StartSessionInput): Session {
    const absoluteExpiresAt = addSeconds(input.now, input.absoluteTtlSeconds);
    const initialToken = RefreshToken.issue({
      id: input.initialTokenId,
      tokenHash: input.initialTokenHash,
      now: input.now,
      expiresAt: earliest(addSeconds(input.now, input.refreshTokenTtlSeconds), absoluteExpiresAt),
    });
    const session = new Session({
      id: input.id,
      userId: input.userId,
      status: SessionStatus.Active,
      ip: input.ip,
      userAgent: input.userAgent,
      createdAt: input.now,
      lastUsedAt: input.now,
      absoluteExpiresAt,
      revokedAt: null,
      revocationReason: null,
      tokens: [initialToken],
    });
    session.record(new SessionCreated(input.id.value, input.userId, input.now));
    return session;
  }

  static restore(props: SessionProps): Session {
    return new Session({ ...props, tokens: [...props.tokens] });
  }

  rotateRefreshToken(input: RotateRefreshTokenInput): void {
    const presented = this.props.tokens.find((token) => token.matches(input.presentedTokenHash));
    if (!presented) {
      throw new InvalidRefreshTokenError();
    }
    if (!this.isActiveAt(input.now)) {
      throw new SessionNotActiveError();
    }
    if (!presented.isActive) {
      this.revoke(SessionRevocationReason.TokenReuse, input.now);
      this.record(
        new RefreshTokenReuseDetected(
          this.props.id.value,
          this.props.userId,
          presented.id.value,
          input.now,
        ),
      );
      throw new RefreshTokenReuseError();
    }
    if (presented.isExpired(input.now)) {
      throw new InvalidRefreshTokenError();
    }
    presented.markRotated(input.newTokenId.value, input.now);
    const newToken = RefreshToken.issue({
      id: input.newTokenId,
      tokenHash: input.newTokenHash,
      now: input.now,
      expiresAt: earliest(
        addSeconds(input.now, input.refreshTokenTtlSeconds),
        this.props.absoluteExpiresAt,
      ),
    });
    this.props.tokens.push(newToken);
    this.props.lastUsedAt = input.now;
    this.record(
      new RefreshTokenRotated(
        this.props.id.value,
        this.props.userId,
        presented.id.value,
        input.newTokenId.value,
        input.now,
      ),
    );
  }

  revoke(reason: SessionRevocationReason, now: Date): void {
    if (this.props.status === SessionStatus.Revoked) {
      return;
    }
    this.props.status = SessionStatus.Revoked;
    this.props.revokedAt = now;
    this.props.revocationReason = reason;
    for (const token of this.props.tokens) {
      token.revoke();
    }
    this.record(new SessionRevoked(this.props.id.value, this.props.userId, reason, now));
  }

  isActiveAt(now: Date): boolean {
    return (
      this.props.status === SessionStatus.Active &&
      now.getTime() < this.props.absoluteExpiresAt.getTime()
    );
  }

  get activeToken(): RefreshToken {
    const token = this.props.tokens.find((candidate) => candidate.isActive);
    if (!token) {
      throw new InvalidRefreshTokenError();
    }
    return token;
  }

  get tokens(): readonly RefreshToken[] {
    return [...this.props.tokens];
  }

  get id(): SessionId {
    return this.props.id;
  }

  get userId(): string {
    return this.props.userId;
  }

  get status(): SessionStatus {
    return this.props.status;
  }

  get ip(): string | null {
    return this.props.ip;
  }

  get userAgent(): string | null {
    return this.props.userAgent;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get lastUsedAt(): Date {
    return this.props.lastUsedAt;
  }

  get absoluteExpiresAt(): Date {
    return this.props.absoluteExpiresAt;
  }

  get revokedAt(): Date | null {
    return this.props.revokedAt;
  }

  get revocationReason(): SessionRevocationReason | null {
    return this.props.revocationReason;
  }
}

function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}

function earliest(first: Date, second: Date): Date {
  return first.getTime() <= second.getTime() ? first : second;
}
