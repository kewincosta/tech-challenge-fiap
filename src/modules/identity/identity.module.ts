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
import { TransactionRunner } from '../../shared/application/ports/transaction-runner.port';
import {
  CLOCK,
  DOMAIN_EVENT_PUBLISHER,
  ID_GENERATOR,
  TRANSACTION_RUNNER,
} from '../../shared/shared.tokens';
import { AuthenticateUserUseCase } from './authentication/application/commands/authenticate-user/authenticate-user.use-case';
import { LogoutAllSessionsUseCase } from './authentication/application/commands/logout-all-sessions/logout-all-sessions.use-case';
import { RefreshSessionUseCase } from './authentication/application/commands/refresh-session/refresh-session.use-case';
import { RevokeSessionUseCase } from './authentication/application/commands/revoke-session/revoke-session.use-case';
import { AuthSettings } from './authentication/application/auth-settings';
import { AccessTokenService } from './authentication/application/ports/access-token.port';
import { RefreshTokenHasher } from './authentication/application/ports/refresh-token-hasher.port';
import { RevokedSessionStore } from './authentication/application/ports/revoked-session-store.port';
import { SessionQueryPort } from './authentication/application/ports/session-query.port';
import { SessionRepository } from './authentication/application/ports/session.repository';
import { ListUserSessionsUseCase } from './authentication/application/queries/list-user-sessions/list-user-sessions.use-case';
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
import { AssignRoleToUserUseCase } from './authorization/application/commands/assign-role-to-user/assign-role-to-user.use-case';
import { CreateRoleUseCase } from './authorization/application/commands/create-role/create-role.use-case';
import { DeleteRoleUseCase } from './authorization/application/commands/delete-role/delete-role.use-case';
import { RevokeRoleFromUserUseCase } from './authorization/application/commands/revoke-role-from-user/revoke-role-from-user.use-case';
import { SetRolePermissionsUseCase } from './authorization/application/commands/set-role-permissions/set-role-permissions.use-case';
import { UpdateRoleUseCase } from './authorization/application/commands/update-role/update-role.use-case';
import { AccessCache } from './authorization/application/ports/access-cache.port';
import { AssignmentRepository } from './authorization/application/ports/assignment.repository';
import { EffectiveAccessReader } from './authorization/application/ports/effective-access-reader.port';
import { PermissionRepository } from './authorization/application/ports/permission.repository';
import { RbacQueryPort } from './authorization/application/ports/rbac-query.port';
import { RoleRepository } from './authorization/application/ports/role.repository';
import { GetRoleUseCase } from './authorization/application/queries/get-role/get-role.use-case';
import { GetUserAccessUseCase } from './authorization/application/queries/get-user-access/get-user-access.use-case';
import { GetUserEffectiveAccessUseCase } from './authorization/application/queries/get-user-effective-access/get-user-effective-access.use-case';
import { ListPermissionsUseCase } from './authorization/application/queries/list-permissions/list-permissions.use-case';
import { ListRolesUseCase } from './authorization/application/queries/list-roles/list-roles.use-case';
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
import { ChangePasswordUseCase } from './users/application/commands/change-password/change-password.use-case';
import { DeactivateUserUseCase } from './users/application/commands/deactivate-user/deactivate-user.use-case';
import { DiscardOpenedAccountUseCase } from './users/application/commands/discard-opened-account/discard-opened-account.use-case';
import { RegisterUserUseCase } from './users/application/commands/register-user/register-user.use-case';
import { UpdateUserUseCase } from './users/application/commands/update-user/update-user.use-case';
import { PasswordHasher } from './users/application/ports/password-hasher.port';
import { UserQueryPort } from './users/application/ports/user-query.port';
import { UserRepository } from './users/application/ports/user.repository';
import { FindUserByDocumentUseCase } from './users/application/queries/find-user-by-document/find-user-by-document.use-case';
import { FindUsersUseCase } from './users/application/queries/find-users/find-users.use-case';
import { GetUserByIdUseCase } from './users/application/queries/get-user-by-id/get-user-by-id.use-case';
import { ListUsersUseCase } from './users/application/queries/list-users/list-users.use-case';
import { VerifyCredentialsUseCase } from './users/application/queries/verify-credentials/verify-credentials.use-case';
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
  PASSWORD_HASHER,
  PERMISSION_REPOSITORY,
  RBAC_QUERY_PORT,
  REFRESH_TOKEN_HASHER,
  REVOKED_SESSION_STORE,
  ROLE_REPOSITORY,
  SESSION_QUERY_PORT,
  SESSION_REPOSITORY,
  USER_QUERY_PORT,
  USER_REPOSITORY,
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
    {
      provide: RegisterUserUseCase,
      useFactory: (
        users: UserRepository,
        passwordHasher: PasswordHasher,
        idGenerator: IdGenerator,
        clock: Clock,
        transactionRunner: TransactionRunner,
        assignRoleToUser: AssignRoleToUserUseCase,
        events: DomainEventPublisher,
      ) =>
        new RegisterUserUseCase(
          users,
          passwordHasher,
          idGenerator,
          clock,
          transactionRunner,
          assignRoleToUser,
          events,
        ),
      inject: [
        USER_REPOSITORY,
        PASSWORD_HASHER,
        ID_GENERATOR,
        CLOCK,
        TRANSACTION_RUNNER,
        AssignRoleToUserUseCase,
        DOMAIN_EVENT_PUBLISHER,
      ],
    },
    {
      provide: DiscardOpenedAccountUseCase,
      useFactory: (users: UserRepository, sessions: SessionRepository) =>
        new DiscardOpenedAccountUseCase(users, sessions),
      inject: [USER_REPOSITORY, SESSION_REPOSITORY],
    },
    {
      provide: UpdateUserUseCase,
      useFactory: (users: UserRepository, clock: Clock, events: DomainEventPublisher) =>
        new UpdateUserUseCase(users, clock, events),
      inject: [USER_REPOSITORY, CLOCK, DOMAIN_EVENT_PUBLISHER],
    },
    {
      provide: DeactivateUserUseCase,
      useFactory: (
        users: UserRepository,
        clock: Clock,
        events: DomainEventPublisher,
        logoutAllSessions: LogoutAllSessionsUseCase,
      ) => new DeactivateUserUseCase(users, clock, events, logoutAllSessions),
      inject: [USER_REPOSITORY, CLOCK, DOMAIN_EVENT_PUBLISHER, LogoutAllSessionsUseCase],
    },
    {
      provide: ChangePasswordUseCase,
      useFactory: (
        users: UserRepository,
        passwordHasher: PasswordHasher,
        clock: Clock,
        logoutAllSessions: LogoutAllSessionsUseCase,
      ) => new ChangePasswordUseCase(users, passwordHasher, clock, logoutAllSessions),
      inject: [USER_REPOSITORY, PASSWORD_HASHER, CLOCK, LogoutAllSessionsUseCase],
    },
    {
      provide: GetUserByIdUseCase,
      useFactory: (users: UserRepository) => new GetUserByIdUseCase(users),
      inject: [USER_REPOSITORY],
    },
    {
      provide: VerifyCredentialsUseCase,
      useFactory: (users: UserRepository, passwordHasher: PasswordHasher) =>
        new VerifyCredentialsUseCase(users, passwordHasher),
      inject: [USER_REPOSITORY, PASSWORD_HASHER],
    },
    {
      provide: FindUserByDocumentUseCase,
      useFactory: (userQuery: UserQueryPort) => new FindUserByDocumentUseCase(userQuery),
      inject: [USER_QUERY_PORT],
    },
    {
      provide: ListUsersUseCase,
      useFactory: (userQuery: UserQueryPort) => new ListUsersUseCase(userQuery),
      inject: [USER_QUERY_PORT],
    },
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
      provide: AuthenticateUserUseCase,
      useFactory: (
        sessions: SessionRepository,
        accessTokens: AccessTokenService,
        refreshTokenHasher: RefreshTokenHasher,
        idGenerator: IdGenerator,
        clock: Clock,
        settings: AuthSettings,
        verifyCredentials: VerifyCredentialsUseCase,
        getUserById: GetUserByIdUseCase,
        events: DomainEventPublisher,
      ) =>
        new AuthenticateUserUseCase(
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
        VerifyCredentialsUseCase,
        GetUserByIdUseCase,
        DOMAIN_EVENT_PUBLISHER,
      ],
    },
    {
      provide: RefreshSessionUseCase,
      useFactory: (
        sessions: SessionRepository,
        accessTokens: AccessTokenService,
        refreshTokenHasher: RefreshTokenHasher,
        revokedSessions: RevokedSessionStore,
        idGenerator: IdGenerator,
        clock: Clock,
        settings: AuthSettings,
        getUserById: GetUserByIdUseCase,
        events: DomainEventPublisher,
      ) =>
        new RefreshSessionUseCase(
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
        GetUserByIdUseCase,
        DOMAIN_EVENT_PUBLISHER,
      ],
    },
    {
      provide: LogoutAllSessionsUseCase,
      useFactory: (
        sessions: SessionRepository,
        revokedSessions: RevokedSessionStore,
        clock: Clock,
        settings: AuthSettings,
        events: DomainEventPublisher,
      ) => new LogoutAllSessionsUseCase(sessions, revokedSessions, clock, settings, events),
      inject: [
        SESSION_REPOSITORY,
        REVOKED_SESSION_STORE,
        CLOCK,
        AUTH_SETTINGS,
        DOMAIN_EVENT_PUBLISHER,
      ],
    },
    {
      provide: RevokeSessionUseCase,
      useFactory: (
        sessions: SessionRepository,
        revokedSessions: RevokedSessionStore,
        clock: Clock,
        settings: AuthSettings,
        getUserEffectiveAccess: GetUserEffectiveAccessUseCase,
        events: DomainEventPublisher,
      ) =>
        new RevokeSessionUseCase(
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
        GetUserEffectiveAccessUseCase,
        DOMAIN_EVENT_PUBLISHER,
      ],
    },
    {
      provide: ListUserSessionsUseCase,
      useFactory: (sessionQuery: SessionQueryPort) => new ListUserSessionsUseCase(sessionQuery),
      inject: [SESSION_QUERY_PORT],
    },
    RefreshTokenReuseSubscriber,
    JwtAuthGuard,
    PendingPasswordGuard,
    {
      provide: CreateRoleUseCase,
      useFactory: (
        roles: RoleRepository,
        permissionCatalog: PermissionCatalogService,
        idGenerator: IdGenerator,
        clock: Clock,
      ) => new CreateRoleUseCase(roles, permissionCatalog, idGenerator, clock),
      inject: [ROLE_REPOSITORY, PermissionCatalogService, ID_GENERATOR, CLOCK],
    },
    {
      provide: UpdateRoleUseCase,
      useFactory: (roles: RoleRepository, clock: Clock) => new UpdateRoleUseCase(roles, clock),
      inject: [ROLE_REPOSITORY, CLOCK],
    },
    {
      provide: DeleteRoleUseCase,
      useFactory: (roles: RoleRepository) => new DeleteRoleUseCase(roles),
      inject: [ROLE_REPOSITORY],
    },
    {
      provide: SetRolePermissionsUseCase,
      useFactory: (
        roles: RoleRepository,
        permissionCatalog: PermissionCatalogService,
        clock: Clock,
      ) => new SetRolePermissionsUseCase(roles, permissionCatalog, clock),
      inject: [ROLE_REPOSITORY, PermissionCatalogService, CLOCK],
    },
    {
      provide: AssignRoleToUserUseCase,
      useFactory: (
        roles: RoleRepository,
        assignments: AssignmentRepository,
        clock: Clock,
        getUserEffectiveAccess: GetUserEffectiveAccessUseCase,
        getUserById: GetUserByIdUseCase,
        events: DomainEventPublisher,
      ) =>
        new AssignRoleToUserUseCase(
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
        GetUserEffectiveAccessUseCase,
        GetUserByIdUseCase,
        DOMAIN_EVENT_PUBLISHER,
      ],
    },
    {
      provide: RevokeRoleFromUserUseCase,
      useFactory: (assignments: AssignmentRepository, clock: Clock, events: DomainEventPublisher) =>
        new RevokeRoleFromUserUseCase(assignments, clock, events),
      inject: [ASSIGNMENT_REPOSITORY, CLOCK, DOMAIN_EVENT_PUBLISHER],
    },
    {
      provide: ListRolesUseCase,
      useFactory: (rbacQuery: RbacQueryPort) => new ListRolesUseCase(rbacQuery),
      inject: [RBAC_QUERY_PORT],
    },
    {
      provide: GetRoleUseCase,
      useFactory: (rbacQuery: RbacQueryPort) => new GetRoleUseCase(rbacQuery),
      inject: [RBAC_QUERY_PORT],
    },
    {
      provide: ListPermissionsUseCase,
      useFactory: (rbacQuery: RbacQueryPort) => new ListPermissionsUseCase(rbacQuery),
      inject: [RBAC_QUERY_PORT],
    },
    {
      provide: GetUserAccessUseCase,
      useFactory: (rbacQuery: RbacQueryPort, getUserById: GetUserByIdUseCase) =>
        new GetUserAccessUseCase(rbacQuery, getUserById),
      inject: [RBAC_QUERY_PORT, GetUserByIdUseCase],
    },
    {
      provide: GetUserEffectiveAccessUseCase,
      useFactory: (effectiveAccess: EffectiveAccessService) =>
        new GetUserEffectiveAccessUseCase(effectiveAccess),
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
    GetUserEffectiveAccessUseCase,
    GetUserByIdUseCase,
    RegisterUserUseCase,
    DiscardOpenedAccountUseCase,
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
