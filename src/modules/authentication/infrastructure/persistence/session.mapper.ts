import { RefreshToken } from '../../domain/entities/refresh-token';
import { Session } from '../../domain/entities/session';
import { RefreshTokenStatus } from '../../domain/refresh-token-status';
import { SessionRevocationReason } from '../../domain/session-revocation-reason';
import { SessionStatus } from '../../domain/session-status';
import { RefreshTokenHash } from '../../domain/value-objects/refresh-token-hash';
import { RefreshTokenId } from '../../domain/value-objects/refresh-token-id';
import { SessionId } from '../../domain/value-objects/session-id';
import { RefreshTokenOrmEntity } from './refresh-token.orm-entity';
import { SessionOrmEntity } from './session.orm-entity';

export interface SessionOrmSnapshot {
  sessionRow: SessionOrmEntity;
  tokenRows: RefreshTokenOrmEntity[];
}

export class SessionMapper {
  static toDomain(
    sessionRow: SessionOrmEntity,
    tokenRows: RefreshTokenOrmEntity[],
    userExternalId: string,
    replacedByExternalIdByInternalId: Map<string, string>,
  ): Session {
    return Session.restore({
      id: SessionId.create(sessionRow.externalId),
      userId: userExternalId,
      status: sessionRow.status as SessionStatus,
      ip: sessionRow.ip,
      userAgent: sessionRow.userAgent,
      createdAt: sessionRow.createdAt,
      lastUsedAt: sessionRow.lastUsedAt,
      absoluteExpiresAt: sessionRow.absoluteExpiresAt,
      revokedAt: sessionRow.revokedAt,
      revocationReason: sessionRow.revocationReason as SessionRevocationReason | null,
      tokens: tokenRows.map((tokenRow) =>
        SessionMapper.tokenToDomain(tokenRow, replacedByExternalIdByInternalId),
      ),
    });
  }

  static toOrm(session: Session): SessionOrmSnapshot {
    const sessionRow = new SessionOrmEntity();
    sessionRow.externalId = session.id.value;
    sessionRow.status = session.status;
    sessionRow.ip = session.ip;
    sessionRow.userAgent = session.userAgent;
    sessionRow.createdAt = session.createdAt;
    sessionRow.lastUsedAt = session.lastUsedAt;
    sessionRow.absoluteExpiresAt = session.absoluteExpiresAt;
    sessionRow.revokedAt = session.revokedAt;
    sessionRow.revocationReason = session.revocationReason;
    const tokenRows = session.tokens.map((token) => {
      const tokenRow = new RefreshTokenOrmEntity();
      tokenRow.externalId = token.id.value;
      tokenRow.tokenHash = token.tokenHash.value;
      tokenRow.status = token.status;
      tokenRow.createdAt = token.createdAt;
      tokenRow.expiresAt = token.expiresAt;
      tokenRow.rotatedAt = token.rotatedAt;
      tokenRow.replacedByInternalId = null;
      return tokenRow;
    });
    return { sessionRow, tokenRows };
  }

  private static tokenToDomain(
    tokenRow: RefreshTokenOrmEntity,
    replacedByExternalIdByInternalId: Map<string, string>,
  ): RefreshToken {
    return RefreshToken.restore({
      id: RefreshTokenId.create(tokenRow.externalId),
      tokenHash: RefreshTokenHash.create(tokenRow.tokenHash),
      status: tokenRow.status as RefreshTokenStatus,
      createdAt: tokenRow.createdAt,
      expiresAt: tokenRow.expiresAt,
      rotatedAt: tokenRow.rotatedAt,
      replacedById: tokenRow.replacedByInternalId
        ? (replacedByExternalIdByInternalId.get(tokenRow.replacedByInternalId) ?? null)
        : null,
    });
  }
}
