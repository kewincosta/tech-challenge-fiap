import { Session } from '../../domain/entities/session';
import { SessionRevocationReason } from '../../domain/session-revocation-reason';
import { RefreshTokenHash } from '../../domain/value-objects/refresh-token-hash';
import { SessionId } from '../../domain/value-objects/session-id';

export interface SessionRepository {
  findById(id: SessionId): Promise<Session | null>;
  findByRefreshTokenHash(hash: RefreshTokenHash): Promise<Session | null>;
  save(session: Session): Promise<void>;
  /** Whether the user has a session, active or not. */
  existsByUserId(userId: string): Promise<boolean>;
  revokeAllActiveByUserId(
    userId: string,
    reason: SessionRevocationReason,
    now: Date,
  ): Promise<string[]>;
}
