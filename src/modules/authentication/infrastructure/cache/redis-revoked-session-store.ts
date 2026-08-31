import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../../../shared/infrastructure/redis/redis.module';
import { RevokedSessionStore } from '../../application/ports/revoked-session-store.port';

@Injectable()
export class RedisRevokedSessionStore implements RevokedSessionStore {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async add(sessionId: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(this.key(sessionId), '1', 'EX', Math.max(ttlSeconds, 1));
  }

  async addMany(sessionIds: string[], ttlSeconds: number): Promise<void> {
    if (sessionIds.length === 0) {
      return;
    }
    const pipeline = this.redis.pipeline();
    for (const sessionId of sessionIds) {
      pipeline.set(this.key(sessionId), '1', 'EX', Math.max(ttlSeconds, 1));
    }
    await pipeline.exec();
  }

  async isRevoked(sessionId: string): Promise<boolean> {
    return (await this.redis.exists(this.key(sessionId))) === 1;
  }

  private key(sessionId: string): string {
    return `auth:revoked-session:${sessionId}`;
  }
}
