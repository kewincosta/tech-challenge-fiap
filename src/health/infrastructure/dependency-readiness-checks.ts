import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { DataSource } from 'typeorm';
import { REDIS_CLIENT } from '../../shared/infrastructure/redis/redis.module';
import { ReadinessChecks } from '../application/ports/readiness-checks.port';

@Injectable()
export class DependencyReadinessChecks implements ReadinessChecks {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(REDIS_CLIENT) private readonly client: Redis,
  ) {}

  async database(): Promise<void> {
    await this.dataSource.query('SELECT 1');
  }

  async redis(): Promise<void> {
    await this.client.ping();
  }
}
