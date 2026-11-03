import { RevokedSessionStore } from '../../../src/modules/identity/authentication/application/ports/revoked-session-store.port';

export class FakeRevokedSessionStore implements RevokedSessionStore {
  readonly revoked = new Set<string>();
  /** How long each revoked session stays marked, in seconds, when the caller said. */
  readonly ttlSeconds = new Map<string, number>();

  async add(sessionId: string, ttlSeconds?: number): Promise<void> {
    this.mark(sessionId, ttlSeconds);
    return Promise.resolve();
  }

  async addMany(sessionIds: string[], ttlSeconds?: number): Promise<void> {
    for (const sessionId of sessionIds) {
      this.mark(sessionId, ttlSeconds);
    }
    return Promise.resolve();
  }

  async isRevoked(sessionId: string): Promise<boolean> {
    return Promise.resolve(this.revoked.has(sessionId));
  }

  private mark(sessionId: string, ttlSeconds?: number): void {
    this.revoked.add(sessionId);
    if (ttlSeconds !== undefined) {
      this.ttlSeconds.set(sessionId, ttlSeconds);
    }
  }
}
