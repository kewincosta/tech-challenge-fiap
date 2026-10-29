export interface RevokedSessionStore {
  add(sessionId: string, ttlSeconds: number): Promise<void>;
  addMany(sessionIds: string[], ttlSeconds: number): Promise<void>;
  isRevoked(sessionId: string): Promise<boolean>;
}
