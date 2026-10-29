import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { authConfig } from '../../config/auth.config';
import { Clock } from '../../shared/application/ports/clock.port';
import { DomainEventPublisher } from '../../shared/application/ports/domain-event-publisher.port';
import { IdGenerator } from '../../shared/application/ports/id-generator.port';
import { InMemoryDomainEventDispatcher } from '../../shared/infrastructure/events/in-memory-domain-event-dispatcher';
import { RedisModule } from '../../shared/infrastructure/redis/redis.module';
import { CLOCK, DOMAIN_EVENT_PUBLISHER, ID_GENERATOR } from '../../shared/shared.tokens';
import { AuthenticateUserHandler } from './authentication/application/commands/authenticate-user/authenticate-user.handler';
import { LogoutAllSessionsHandler } from './authentication/application/commands/logout-all-sessions/logout-all-sessions.handler';
import { RefreshSessionHandler } from './authentication/application/commands/refresh-session/refresh-session.handler';
import { RevokeSessionHandler } from './authentication/application/commands/revoke-session/revoke-session.handler';
import { AuthSettings } from './authentication/application/auth-settings';
import { AccessTokenService } from './authentication/application/ports/access-token.port';
import { RefreshTokenHasher } from './authentication/application/ports/refresh-token-hasher.port';
import { RevokedSessionStore } from './authentication/application/ports/revoked-session-store.port';
import { SessionQueryPort } from './authentication/application/ports/session-query.port';
import { SessionRepository } from './authentication/application/ports/session.repository';
import { ListUserSessionsHandler } from './authentication/application/queries/list-user-sessions/list-user-sessions.handler';
import { RefreshTokenReuseDetected } from './authentication/domain/events/refresh-token-reuse-detected.event';
import { RedisRevokedSessionStore } from './authentication/infrastructure/cache/redis-revoked-session-store';
import { RefreshTokenReuseSubscriber } from './authentication/infrastructure/logging/security-events.subscriber';
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
import { AccessCache } from './authorization/application/ports/access-cache.port';
import { AssignmentRepository } from './authorization/application/ports/assignment.repository';
import { EffectiveAccessReader } from './authorization/application/ports/effective-access-reader.port';
import { PermissionRepository } from './authorization/application/ports/permission.repository';
import { RbacQueryPort } from './authorization/application/ports/rbac-query.port';
import { RoleRepository } from './authorization/application/ports/role.repository';
import { GetRoleHandler } from './authorization/application/queries/get-role/get-role.handler';
import { GetUserAccessHandler } from './authorization/application/queries/get-user-access/get-user-access.handler';
import { GetUserEffectiveAccessHandler } from './authorization/application/queries/get-user-effective-access/get-user-effective-access.handler';
import { ListPermissionsHandler } from './authorization/application/queries/list-permissions/list-permissions.handler';
import { ListRolesHandler } from './authorization/application/queries/list-roles/list-roles.handler';
import { EffectiveAccessService } from './authorization/application/services/effective-access.service';
import { PermissionCatalogService } from './authorization/application/services/permission-catalog.service';
import { AccessCacheInvalidationSubscriber } from './authorization/application/subscribers/access-cache-invalidation.subscriber';
import { RoleAssignedToUser } from './authorization/domain/events/role-assigned-to-user.event';
import { RoleRevokedFromUser } from './authorization/domain/events/role-revoked-from-user.event';
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
import {
  ACCESS_CACHE,
  ACCESS_TOKEN_SERVICE,
  ASSIGNMENT_REPOSITORY,
  AUTH_SETTINGS,
  EFFECTIVE_ACCESS_READER,
  PERMISSION_REPOSITORY,
  RBAC_QUERY_PORT,
  REFRESH_TOKEN_HASHER,
  REVOKED_SESSION_STORE,
  ROLE_REPOSITORY,
  SESSION_QUERY_PORT,
  SESSION_REPOSITORY,
} from './identity.tokens';

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
    {
      provide: AUTH_SETTINGS,
      useFactory: (config: ConfigType<typeof authConfig>): AuthSettings => ({
        accessTokenTtlSeconds: config.accessTokenTtlSeconds,
        refreshTokenTtlSeconds: config.refreshTokenTtlSeconds,
        sessionAbsoluteTtlSeconds: config.sessionAbsoluteTtlSeconds,
      }),
      inject: [authConfig.KEY],
    },
    {
      provide: AuthenticateUserHandler,
      useFactory: (
        sessions: SessionRepository,
        accessTokens: AccessTokenService,
        refreshTokenHasher: RefreshTokenHasher,
        idGenerator: IdGenerator,
        clock: Clock,
        settings: AuthSettings,
        verifyCredentials: VerifyCredentialsHandler,
        getUserById: GetUserByIdHandler,
        events: DomainEventPublisher,
      ) =>
        new AuthenticateUserHandler(
          sessions,
          accessTokens,
          refreshTokenHasher,
          idGenerator,
          clock,
          settings,
          verifyCredentials,
          getUserById,
          events,
        ),
      inject: [
        SESSION_REPOSITORY,
        ACCESS_TOKEN_SERVICE,
        REFRESH_TOKEN_HASHER,
        ID_GENERATOR,
        CLOCK,
        AUTH_SETTINGS,
        VerifyCredentialsHandler,
        GetUserByIdHandler,
        DOMAIN_EVENT_PUBLISHER,
      ],
    },
    {
      provide: RefreshSessionHandler,
      useFactory: (
        sessions: SessionRepository,
        accessTokens: AccessTokenService,
        refreshTokenHasher: RefreshTokenHasher,
        revokedSessions: RevokedSessionStore,
        idGenerator: IdGenerator,
        clock: Clock,
        settings: AuthSettings,
        getUserById: GetUserByIdHandler,
        events: DomainEventPublisher,
      ) =>
        new RefreshSessionHandler(
          sessions,
          accessTokens,
          refreshTokenHasher,
          revokedSessions,
          idGenerator,
          clock,
          settings,
          getUserById,
          events,
        ),
      inject: [
        SESSION_REPOSITORY,
        ACCESS_TOKEN_SERVICE,
        REFRESH_TOKEN_HASHER,
        REVOKED_SESSION_STORE,
        ID_GENERATOR,
        CLOCK,
        AUTH_SETTINGS,
        GetUserByIdHandler,
        DOMAIN_EVENT_PUBLISHER,
      ],
    },
    {
      provide: LogoutAllSessionsHandler,
      useFactory: (
        sessions: SessionRepository,
        revokedSessions: RevokedSessionStore,
        clock: Clock,
        settings: AuthSettings,
        events: DomainEventPublisher,
      ) => new LogoutAllSessionsHandler(sessions, revokedSessions, clock, settings, events),
      inject: [
        SESSION_REPOSITORY,
        REVOKED_SESSION_STORE,
        CLOCK,
        AUTH_SETTINGS,
        DOMAIN_EVENT_PUBLISHER,
      ],
    },
    {
      provide: RevokeSessionHandler,
      useFactory: (
        sessions: SessionRepository,
        revokedSessions: RevokedSessionStore,
        clock: Clock,
        settings: AuthSettings,
        getUserEffectiveAccess: GetUserEffectiveAccessHandler,
        events: DomainEventPublisher,
      ) =>
        new RevokeSessionHandler(
          sessions,
          revokedSessions,
          clock,
          settings,
          getUserEffectiveAccess,
          events,
        ),
      inject: [
        SESSION_REPOSITORY,
        REVOKED_SESSION_STORE,
        CLOCK,
        AUTH_SETTINGS,
        GetUserEffectiveAccessHandler,
        DOMAIN_EVENT_PUBLISHER,
      ],
    },
    {
      provide: ListUserSessionsHandler,
      useFactory: (sessionQuery: SessionQueryPort) => new ListUserSessionsHandler(sessionQuery),
      inject: [SESSION_QUERY_PORT],
    },
    RefreshTokenReuseSubscriber,
    JwtAuthGuard,
    PendingPasswordGuard,
    {
      provide: CreateRoleHandler,
      useFactory: (
        roles: RoleRepository,
        permissionCatalog: PermissionCatalogService,
        idGenerator: IdGenerator,
        clock: Clock,
      ) => new CreateRoleHandler(roles, permissionCatalog, idGenerator, clock),
      inject: [ROLE_REPOSITORY, PermissionCatalogService, ID_GENERATOR, CLOCK],
    },
    {
      provide: UpdateRoleHandler,
      useFactory: (roles: RoleRepository, clock: Clock) => new UpdateRoleHandler(roles, clock),
      inject: [ROLE_REPOSITORY, CLOCK],
    },
    {
      provide: DeleteRoleHandler,
      useFactory: (roles: RoleRepository) => new DeleteRoleHandler(roles),
      inject: [ROLE_REPOSITORY],
    },
    {
      provide: SetRolePermissionsHandler,
      useFactory: (
        roles: RoleRepository,
        permissionCatalog: PermissionCatalogService,
        clock: Clock,
      ) => new SetRolePermissionsHandler(roles, permissionCatalog, clock),
      inject: [ROLE_REPOSITORY, PermissionCatalogService, CLOCK],
    },
    {
      provide: AssignRoleToUserHandler,
      useFactory: (
        roles: RoleRepository,
        assignments: AssignmentRepository,
        clock: Clock,
        getUserEffectiveAccess: GetUserEffectiveAccessHandler,
        getUserById: GetUserByIdHandler,
        events: DomainEventPublisher,
      ) =>
        new AssignRoleToUserHandler(
          roles,
          assignments,
          clock,
          getUserEffectiveAccess,
          getUserById,
          events,
        ),
      inject: [
        ROLE_REPOSITORY,
        ASSIGNMENT_REPOSITORY,
        CLOCK,
        GetUserEffectiveAccessHandler,
        GetUserByIdHandler,
        DOMAIN_EVENT_PUBLISHER,
      ],
    },
    {
      provide: RevokeRoleFromUserHandler,
      useFactory: (assignments: AssignmentRepository, clock: Clock, events: DomainEventPublisher) =>
        new RevokeRoleFromUserHandler(assignments, clock, events),
      inject: [ASSIGNMENT_REPOSITORY, CLOCK, DOMAIN_EVENT_PUBLISHER],
    },
    {
      provide: ListRolesHandler,
      useFactory: (rbacQuery: RbacQueryPort) => new ListRolesHandler(rbacQuery),
      inject: [RBAC_QUERY_PORT],
    },
    {
      provide: GetRoleHandler,
      useFactory: (rbacQuery: RbacQueryPort) => new GetRoleHandler(rbacQuery),
      inject: [RBAC_QUERY_PORT],
    },
    {
      provide: ListPermissionsHandler,
      useFactory: (rbacQuery: RbacQueryPort) => new ListPermissionsHandler(rbacQuery),
      inject: [RBAC_QUERY_PORT],
    },
    {
      provide: GetUserAccessHandler,
      useFactory: (rbacQuery: RbacQueryPort, getUserById: GetUserByIdHandler) =>
        new GetUserAccessHandler(rbacQuery, getUserById),
      inject: [RBAC_QUERY_PORT, GetUserByIdHandler],
    },
    {
      provide: GetUserEffectiveAccessHandler,
      useFactory: (effectiveAccess: EffectiveAccessService) =>
        new GetUserEffectiveAccessHandler(effectiveAccess),
      inject: [EffectiveAccessService],
    },
    {
      provide: EffectiveAccessService,
      useFactory: (cache: AccessCache, reader: EffectiveAccessReader) =>
        new EffectiveAccessService(cache, reader),
      inject: [ACCESS_CACHE, EFFECTIVE_ACCESS_READER],
    },
    {
      provide: PermissionCatalogService,
      useFactory: (permissions: PermissionRepository) => new PermissionCatalogService(permissions),
      inject: [PERMISSION_REPOSITORY],
    },
    {
      provide: AccessCacheInvalidationSubscriber,
      useFactory: (effectiveAccess: EffectiveAccessService) =>
        new AccessCacheInvalidationSubscriber(effectiveAccess),
      inject: [EffectiveAccessService],
    },
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
    GetUserEffectiveAccessHandler,
    GetUserByIdHandler,
    RegisterUserHandler,
    UserKeyResolver,
    FindUsersUseCase,
  ],
})
export class IdentityModule implements OnModuleInit {
  constructor(
    private readonly dispatcher: InMemoryDomainEventDispatcher,
    private readonly accessCacheInvalidation: AccessCacheInvalidationSubscriber,
    private readonly refreshTokenReuse: RefreshTokenReuseSubscriber,
  ) {}

  onModuleInit(): void {
    this.dispatcher.subscribe(RoleAssignedToUser, this.accessCacheInvalidation);
    this.dispatcher.subscribe(RoleRevokedFromUser, this.accessCacheInvalidation);
    this.dispatcher.subscribe(RefreshTokenReuseDetected, this.refreshTokenReuse);
  }
}
