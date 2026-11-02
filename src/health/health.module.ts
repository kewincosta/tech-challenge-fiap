import { Module } from '@nestjs/common';
import { RedisModule } from '../shared/infrastructure/redis/redis.module';
import { CheckReadinessUseCase } from './application/check-readiness.use-case';
import { ReadinessChecks } from './application/ports/readiness-checks.port';
import { READINESS_CHECKS } from './health.tokens';
import { DependencyReadinessChecks } from './infrastructure/dependency-readiness-checks';
import { HealthController } from './presentation/health.controller';

@Module({
  imports: [RedisModule],
  controllers: [HealthController],
  providers: [
    { provide: READINESS_CHECKS, useClass: DependencyReadinessChecks },
    {
      provide: CheckReadinessUseCase,
      useFactory: (checks: ReadinessChecks) => new CheckReadinessUseCase(checks),
      inject: [READINESS_CHECKS],
    },
  ],
})
export class HealthModule {}
