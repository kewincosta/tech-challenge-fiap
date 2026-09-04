import { randomUUID } from 'node:crypto';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { CqrsModule } from '@nestjs/cqrs';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import Redis from 'ioredis';
import { LoggerModule } from 'nestjs-pino';
import { appConfig } from './config/app.config';
import { authConfig } from './config/auth.config';
import { databaseConfig } from './config/database.config';
import { validateEnv } from './config/env.validation';
import { rateLimitConfig } from './config/rate-limit.config';
import { redisConfig } from './config/redis.config';
import { AuthenticationModule } from './modules/authentication/authentication.module';
import { JwtAuthGuard } from './modules/authentication/presentation/guards/jwt-auth.guard';
import { PendingPasswordGuard } from './modules/authentication/presentation/guards/pending-password.guard';
import { AuthorizationModule } from './modules/authorization/authorization.module';
import { PermissionsGuard } from './modules/authorization/presentation/guards/permissions.guard';
import { CustomersModule } from './modules/customers/customers.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { UsersModule } from './modules/users/users.module';
import { ServicesModule } from './modules/services/services.module';
import { VehiclesModule } from './modules/vehicles/vehicles.module';
import { WorkOrdersModule } from './modules/work-orders/work-orders.module';
import { DatabaseModule } from './shared/infrastructure/database/database.module';
import { REDIS_CLIENT, RedisModule } from './shared/infrastructure/redis/redis.module';
import { GlobalExceptionFilter } from './shared/presentation/filters/global-exception.filter';
import { createAppValidationPipe } from './shared/presentation/pipes/app-validation.pipe';
import { RejectNullBytesPipe } from './shared/presentation/pipes/reject-null-bytes.pipe';
import { SharedModule } from './shared/shared.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
      load: [appConfig, databaseConfig, redisConfig, authConfig, rateLimitConfig],
      validate: validateEnv,
    }),
    LoggerModule.forRootAsync({
      inject: [appConfig.KEY],
      useFactory: (app: ConfigType<typeof appConfig>) => ({
        pinoHttp: {
          level: app.nodeEnv === 'test' ? 'silent' : 'info',
          genReqId: () => randomUUID(),
          redact: {
            paths: [
              'req.headers.authorization',
              'req.body.password',
              'req.body.refreshToken',
              // Defensive: pino-http's default res serializer carries no body today, so this
              // path matches nothing yet, but the staff-creation response (IDENT-07 AC6) must
              // never appear in a log line if a future serializer starts including one.
              'res.body.temporaryPassword',
            ],
            remove: true,
          },
          transport:
            app.nodeEnv === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
        },
      }),
    }),
    SharedModule,
    DatabaseModule,
    RedisModule,
    CqrsModule.forRoot(),
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [rateLimitConfig.KEY, REDIS_CLIENT],
      useFactory: (limits: ConfigType<typeof rateLimitConfig>, redis: Redis) => ({
        throttlers: [{ ttl: limits.ttlSeconds * 1000, limit: limits.maxRequests }],
        storage: new ThrottlerStorageRedisService(redis),
      }),
    }),
    UsersModule,
    AuthenticationModule,
    AuthorizationModule,
    CustomersModule,
    VehiclesModule,
    ServicesModule,
    InventoryModule,
    WorkOrdersModule,
  ],
  providers: [
    // Runs before the validation pipe: a NUL byte reaches the database through any filter
    // the DTO happens to allow, and Postgres answers with an error rather than a result.
    { provide: APP_PIPE, useClass: RejectNullBytesPipe },
    { provide: APP_PIPE, useFactory: createAppValidationPipe },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useExisting: JwtAuthGuard },
    { provide: APP_GUARD, useExisting: PendingPasswordGuard },
    { provide: APP_GUARD, useExisting: PermissionsGuard },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
})
export class AppModule {}
