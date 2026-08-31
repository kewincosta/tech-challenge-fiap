import { Inject, Injectable, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import Redis from 'ioredis';
import { redisConfig } from '../../../config/redis.config';

export const REDIS_CLIENT = Symbol('RedisClient');

@Injectable()
class RedisShutdown implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await this.client.quit();
  }
}

@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [redisConfig.KEY],
      useFactory: (cfg: ConfigType<typeof redisConfig>) =>
        new Redis({
          host: cfg.host,
          port: cfg.port,
          db: cfg.db,
          maxRetriesPerRequest: 2,
        }),
    },
    RedisShutdown,
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
