import { Module } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { authConfig } from '../../config/auth.config';
import { RedisModule } from '../../shared/infrastructure/redis/redis.module';
import { AuthenticateUserHandler } from './authentication/application/commands/authenticate-user/authenticate-user.handler';
import { LogoutAllSessionsHandler } from './authentication/application/commands/logout-all-sessions/logout-all-sessions.handler';
import { RefreshSessionHandler } from './authentication/application/commands/refresh-session/refresh-session.handler';
import { RevokeSessionHandler } from './authentication/application/commands/revoke-session/revoke-session.handler';
import { ACCESS_TOKEN_SERVICE } from './authentication/application/ports/access-token.port';
import { REFRESH_TOKEN_HASHER } from './authentication/application/ports/refresh-token-hasher.port';
import { REVOKED_SESSION_STORE } from './authentication/application/ports/revoked-session-store.port';
import { SESSION_QUERY_PORT } from './authentication/application/ports/session-query.port';
import { ListUserSessionsHandler } from './authentication/application/queries/list-user-sessions/list-user-sessions.handler';
import { RefreshTokenReuseSubscriber } from './authentication/application/subscribers/security-events.subscriber';
import { SESSION_REPOSITORY } from './authentication/domain/repositories/session.repository';
import { RedisRevokedSessionStore } from './authentication/infrastructure/cache/redis-revoked-session-store';
import { RefreshTokenOrmEntity } from './authentication/infrastructure/persistence/refresh-token.orm-entity';
import { SessionOrmEntity } from './authentication/infrastructure/persistence/session.orm-entity';
import { TypeOrmSessionQueryAdapter } from './authentication/infrastructure/persistence/typeorm-session-query.adapter';
import { TypeOrmSessionRepository } from './authentication/infrastructure/persistence/typeorm-session.repository';
import { JwtAccessTokenService } from './authentication/infrastructure/security/jwt-access-token.service';
import { Sha256RefreshTokenHasher } from './authentication/infrastructure/security/sha256-refresh-token-hasher';
import { AuthController } from './authentication/presentation/controllers/auth.controller';
import { JwtAuthGuard } from './authentication/presentation/guards/jwt-auth.guard';
import { PendingPasswordGuard } from './authentication/presentation/guards/pending-password.guard';
import { AssignRoleToUserHandler } from './authorization/application/commands/assign-role-to-user/assign-role-to-user.handler';
import { CreateRoleHandler } from './authorization/application/commands/create-role/create-role.handler';
import { DeleteRoleHandler } from './authorization/application/commands/delete-role/delete-role.handler';
import { RevokeRoleFromUserHandler } from './authorization/application/commands/revoke-role-from-user/revoke-role-from-user.handler';
import { SetRolePermissionsHandler } from './authorization/application/commands/set-role-permissions/set-role-permissions.handler';
import { UpdateRoleHandler } from './authorization/application/commands/update-role/update-role.handler';
import { ACCESS_CACHE } from './authorization/application/ports/access-cache.port';
import { ASSIGNMENT_REPOSITORY } from './authorization/application/ports/assignment.repository';
import { EFFECTIVE_ACCESS_READER } from './authorization/application/ports/effective-access-reader.port';
import { RBAC_QUERY_PORT } from './authorization/application/ports/rbac-query.port';
import { GetRoleHandler } from './authorization/application/queries/get-role/get-role.handler';
import { GetUserAccessHandler } from './authorization/application/queries/get-user-access/get-user-access.handler';
import { GetUserEffectiveAccessHandler } from './authorization/application/queries/get-user-effective-access/get-user-effective-access.handler';
import { ListPermissionsHandler } from './authorization/application/queries/list-permissions/list-permissions.handler';
import { ListRolesHandler } from './authorization/application/queries/list-roles/list-roles.handler';
import { EffectiveAccessService } from './authorization/application/services/effective-access.service';
import { PermissionCatalogService } from './authorization/application/services/permission-catalog.service';
import { AccessCacheInvalidationSubscriber } from './authorization/application/subscribers/access-cache-invalidation.subscriber';
import { PERMISSION_REPOSITORY } from './authorization/domain/repositories/permission.repository';
import { ROLE_REPOSITORY } from './authorization/domain/repositories/role.repository';
import { RedisAccessCache } from './authorization/infrastructure/cache/redis-access-cache';
import { PermissionOrmEntity } from './authorization/infrastructure/persistence/permission.orm-entity';
import { RolePermissionOrmEntity } from './authorization/infrastructure/persistence/role-permission.orm-entity';
import { RoleOrmEntity } from './authorization/infrastructure/persistence/role.orm-entity';
import { TypeOrmAssignmentRepository } from './authorization/infrastructure/persistence/typeorm-assignment.repository';
import { TypeOrmEffectiveAccessReader } from './authorization/infrastructure/persistence/typeorm-effective-access.reader';
import { TypeOrmPermissionRepository } from './authorization/infrastructure/persistence/typeorm-permission.repository';
import { TypeOrmRbacQueryAdapter } from './authorization/infrastructure/persistence/typeorm-rbac-query.adapter';
import { TypeOrmRoleRepository } from './authorization/infrastructure/persistence/typeorm-role.repository';
import { UserRoleOrmEntity } from './authorization/infrastructure/persistence/user-role.orm-entity';
import { PermissionsController } from './authorization/presentation/controllers/permissions.controller';
import { RolesController } from './authorization/presentation/controllers/roles.controller';
import { UserAccessController } from './authorization/presentation/controllers/user-access.controller';
import { PermissionsGuard } from './authorization/presentation/guards/permissions.guard';
import { ChangePasswordHandler } from './users/application/commands/change-password/change-password.handler';
import { DeactivateUserHandler } from './users/application/commands/deactivate-user/deactivate-user.handler';
import { RegisterUserHandler } from './users/application/commands/register-user/register-user.handler';
import { UpdateUserHandler } from './users/application/commands/update-user/update-user.handler';
import { PASSWORD_HASHER } from './users/application/ports/password-hasher.port';
import { USER_QUERY_PORT, UserQueryPort } from './users/application/ports/user-query.port';
import { FindUserByDocumentHandler } from './users/application/queries/find-user-by-document/find-user-by-document.handler';
import { FindUsersUseCase } from './users/application/queries/find-users/find-users.use-case';
import { GetUserByIdHandler } from './users/application/queries/get-user-by-id/get-user-by-id.handler';
import { ListUsersHandler } from './users/application/queries/list-users/list-users.handler';
import { VerifyCredentialsHandler } from './users/application/queries/verify-credentials/verify-credentials.handler';
import { USER_REPOSITORY } from './users/domain/repositories/user.repository';
import { TypeOrmUserQueryAdapter } from './users/infrastructure/persistence/typeorm-user-query.adapter';
import { TypeOrmUserRepository } from './users/infrastructure/persistence/typeorm-user.repository';
import { UserOrmEntity } from './users/infrastructure/persistence/user.orm-entity';
import { UserKeyResolver } from './users/infrastructure/persistence/user-key-resolver';
import { Argon2PasswordHasher } from './users/infrastructure/security/argon2-password-hasher';
import { UsersController } from './users/presentation/controllers/users.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserOrmEntity,
      SessionOrmEntity,
      RefreshTokenOrmEntity,
      RoleOrmEntity,
      PermissionOrmEntity,
      UserRoleOrmEntity,
      RolePermissionOrmEntity,
    ]),
    RedisModule,
    JwtModule.registerAsync({
      inject: [authConfig.KEY],
      useFactory: (config: ConfigType<typeof authConfig>) => ({
        secret: config.jwtSecret,
        signOptions: { expiresIn: config.accessTokenTtlSeconds },
      }),
    }),
  ],
  controllers: [
    UsersController,
    AuthController,
    RolesController,
    PermissionsController,
    UserAccessController,
  ],
  providers: [
    RegisterUserHandler,
    UpdateUserHandler,
    DeactivateUserHandler,
    ChangePasswordHandler,
    GetUserByIdHandler,
    VerifyCredentialsHandler,
    FindUserByDocumentHandler,
    ListUsersHandler,
    AuthenticateUserHandler,
    RefreshSessionHandler,
    LogoutAllSessionsHandler,
    RevokeSessionHandler,
    ListUserSessionsHandler,
    RefreshTokenReuseSubscriber,
    JwtAuthGuard,
    PendingPasswordGuard,
    CreateRoleHandler,
    UpdateRoleHandler,
    DeleteRoleHandler,
    SetRolePermissionsHandler,
    AssignRoleToUserHandler,
    RevokeRoleFromUserHandler,
    ListRolesHandler,
    GetRoleHandler,
    ListPermissionsHandler,
    GetUserAccessHandler,
    GetUserEffectiveAccessHandler,
    EffectiveAccessService,
    PermissionCatalogService,
    AccessCacheInvalidationSubscriber,
    PermissionsGuard,
    { provide: USER_REPOSITORY, useClass: TypeOrmUserRepository },
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
    { provide: USER_QUERY_PORT, useClass: TypeOrmUserQueryAdapter },
    { provide: SESSION_REPOSITORY, useClass: TypeOrmSessionRepository },
    { provide: ACCESS_TOKEN_SERVICE, useClass: JwtAccessTokenService },
    { provide: REFRESH_TOKEN_HASHER, useClass: Sha256RefreshTokenHasher },
    { provide: REVOKED_SESSION_STORE, useClass: RedisRevokedSessionStore },
    { provide: SESSION_QUERY_PORT, useClass: TypeOrmSessionQueryAdapter },
    { provide: ROLE_REPOSITORY, useClass: TypeOrmRoleRepository },
    { provide: PERMISSION_REPOSITORY, useClass: TypeOrmPermissionRepository },
    { provide: ASSIGNMENT_REPOSITORY, useClass: TypeOrmAssignmentRepository },
    { provide: EFFECTIVE_ACCESS_READER, useClass: TypeOrmEffectiveAccessReader },
    { provide: ACCESS_CACHE, useClass: RedisAccessCache },
    { provide: RBAC_QUERY_PORT, useClass: TypeOrmRbacQueryAdapter },
    UserKeyResolver,
    {
      provide: FindUsersUseCase,
      useFactory: (userQuery: UserQueryPort) => new FindUsersUseCase(userQuery),
      inject: [USER_QUERY_PORT],
    },
  ],
  exports: [
    JwtAuthGuard,
    PendingPasswordGuard,
    PermissionsGuard,
    UserKeyResolver,
    FindUsersUseCase,
  ],
})
export class IdentityModule {}
