import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../../../shared/infrastructure/redis/redis.module';
import { EffectiveAccessDto } from '../../application/dtos/effective-access.dto';
import { AccessCache } from '../../application/ports/access-cache.port';

const CACHE_TTL_SECONDS = 60;

@Injectable()
export class RedisAccessCache implements AccessCache {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async get(userId: string): Promise<EffectiveAccessDto | null> {
    const cached = await this.redis.get(this.key(userId));
    if (!cached) {
      return null;
    }
    try {
      return JSON.parse(cached) as EffectiveAccessDto;
    } catch {
      return null;
    }
  }

  async set(userId: string, access: EffectiveAccessDto): Promise<void> {
    await this.redis.set(this.key(userId), JSON.stringify(access), 'EX', CACHE_TTL_SECONDS);
  }

  async invalidate(userId: string): Promise<void> {
    await this.redis.del(this.key(userId));
  }

  private key(userId: string): string {
    return `authz:access:${userId}`;
  }
}
