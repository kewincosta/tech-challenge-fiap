import { Session } from '../entities/session';
import { SessionRevocationReason } from '../session-revocation-reason';
import { RefreshTokenHash } from '../value-objects/refresh-token-hash';
import { SessionId } from '../value-objects/session-id';

export interface SessionRepository {
  findById(id: SessionId): Promise<Session | null>;
  findByRefreshTokenHash(hash: RefreshTokenHash): Promise<Session | null>;
  save(session: Session): Promise<void>;
  revokeAllActiveByUserId(
    userId: string,
    reason: SessionRevocationReason,
    now: Date,
  ): Promise<string[]>;
}

export const SESSION_REPOSITORY = Symbol('SessionRepository');
