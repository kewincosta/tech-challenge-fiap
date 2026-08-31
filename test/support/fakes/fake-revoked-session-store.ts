import { RevokedSessionStore } from '../../../src/modules/authentication/application/ports/revoked-session-store.port';

export class FakeRevokedSessionStore implements RevokedSessionStore {
  readonly revoked = new Set<string>();

  async add(sessionId: string): Promise<void> {
    this.revoked.add(sessionId);
    return Promise.resolve();
  }

  async addMany(sessionIds: string[]): Promise<void> {
    for (const sessionId of sessionIds) {
      this.revoked.add(sessionId);
    }
    return Promise.resolve();
  }

  async isRevoked(sessionId: string): Promise<boolean> {
    return Promise.resolve(this.revoked.has(sessionId));
  }
}
