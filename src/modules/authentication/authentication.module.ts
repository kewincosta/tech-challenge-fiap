import { Module } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { authConfig } from '../../config/auth.config';
import { RedisModule } from '../../shared/infrastructure/redis/redis.module';
import { AuthenticateUserHandler } from './application/commands/authenticate-user/authenticate-user.handler';
import { LogoutAllSessionsHandler } from './application/commands/logout-all-sessions/logout-all-sessions.handler';
import { RefreshSessionHandler } from './application/commands/refresh-session/refresh-session.handler';
import { RevokeSessionHandler } from './application/commands/revoke-session/revoke-session.handler';
import { ACCESS_TOKEN_SERVICE } from './application/ports/access-token.port';
import { REFRESH_TOKEN_HASHER } from './application/ports/refresh-token-hasher.port';
import { REVOKED_SESSION_STORE } from './application/ports/revoked-session-store.port';
import { SESSION_QUERY_PORT } from './application/ports/session-query.port';
import { ListUserSessionsHandler } from './application/queries/list-user-sessions/list-user-sessions.handler';
import { RefreshTokenReuseSubscriber } from './application/subscribers/security-events.subscriber';
import { SESSION_REPOSITORY } from './domain/repositories/session.repository';
import { RedisRevokedSessionStore } from './infrastructure/cache/redis-revoked-session-store';
import { RefreshTokenOrmEntity } from './infrastructure/persistence/refresh-token.orm-entity';
import { SessionOrmEntity } from './infrastructure/persistence/session.orm-entity';
import { TypeOrmSessionQueryAdapter } from './infrastructure/persistence/typeorm-session-query.adapter';
import { TypeOrmSessionRepository } from './infrastructure/persistence/typeorm-session.repository';
import { JwtAccessTokenService } from './infrastructure/security/jwt-access-token.service';
import { Sha256RefreshTokenHasher } from './infrastructure/security/sha256-refresh-token-hasher';
import { AuthController } from './presentation/controllers/auth.controller';
import { JwtAuthGuard } from './presentation/guards/jwt-auth.guard';
import { PendingPasswordGuard } from './presentation/guards/pending-password.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([SessionOrmEntity, RefreshTokenOrmEntity]),
    RedisModule,
    JwtModule.registerAsync({
      inject: [authConfig.KEY],
      useFactory: (config: ConfigType<typeof authConfig>) => ({
        secret: config.jwtSecret,
        signOptions: { expiresIn: config.accessTokenTtlSeconds },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthenticateUserHandler,
    RefreshSessionHandler,
    LogoutAllSessionsHandler,
    RevokeSessionHandler,
    ListUserSessionsHandler,
    RefreshTokenReuseSubscriber,
    JwtAuthGuard,
    PendingPasswordGuard,
    { provide: SESSION_REPOSITORY, useClass: TypeOrmSessionRepository },
    { provide: ACCESS_TOKEN_SERVICE, useClass: JwtAccessTokenService },
    { provide: REFRESH_TOKEN_HASHER, useClass: Sha256RefreshTokenHasher },
    { provide: REVOKED_SESSION_STORE, useClass: RedisRevokedSessionStore },
    { provide: SESSION_QUERY_PORT, useClass: TypeOrmSessionQueryAdapter },
  ],
  exports: [JwtAuthGuard, PendingPasswordGuard],
})
export class AuthenticationModule {}
