import { Session } from '../../../src/modules/authentication/domain/entities/session';
import { SessionRepository } from '../../../src/modules/authentication/domain/repositories/session.repository';
import { SessionRevocationReason } from '../../../src/modules/authentication/domain/session-revocation-reason';
import { RefreshTokenHash } from '../../../src/modules/authentication/domain/value-objects/refresh-token-hash';
import { SessionId } from '../../../src/modules/authentication/domain/value-objects/session-id';

export class InMemorySessionRepository implements SessionRepository {
  sessions: Session[] = [];
  saveCount = 0;

  async findById(id: SessionId): Promise<Session | null> {
    return Promise.resolve(this.sessions.find((session) => session.id.equals(id)) ?? null);
  }

  async findByRefreshTokenHash(hash: RefreshTokenHash): Promise<Session | null> {
    return Promise.resolve(
      this.sessions.find((session) => session.tokens.some((token) => token.matches(hash))) ?? null,
    );
  }

  async save(session: Session): Promise<void> {
    this.saveCount += 1;
    this.sessions = this.sessions.filter((existing) => !existing.id.equals(session.id));
    this.sessions.push(session);
    return Promise.resolve();
  }

  async revokeAllActiveByUserId(
    userId: string,
    reason: SessionRevocationReason,
    now: Date,
  ): Promise<string[]> {
    const active = this.sessions.filter(
      (session) => session.userId === userId && session.isActiveAt(now),
    );
    for (const session of active) {
      session.revoke(reason, now);
    }
    return Promise.resolve(active.map((session) => session.id.value));
  }
}
