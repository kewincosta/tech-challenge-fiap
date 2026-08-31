import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisModule } from '../../shared/infrastructure/redis/redis.module';
import { AssignRoleToUserHandler } from './application/commands/assign-role-to-user/assign-role-to-user.handler';
import { CreateRoleHandler } from './application/commands/create-role/create-role.handler';
import { DeleteRoleHandler } from './application/commands/delete-role/delete-role.handler';
import { RevokeRoleFromUserHandler } from './application/commands/revoke-role-from-user/revoke-role-from-user.handler';
import { SetRolePermissionsHandler } from './application/commands/set-role-permissions/set-role-permissions.handler';
import { UpdateRoleHandler } from './application/commands/update-role/update-role.handler';
import { ACCESS_CACHE } from './application/ports/access-cache.port';
import { ASSIGNMENT_REPOSITORY } from './application/ports/assignment.repository';
import { EFFECTIVE_ACCESS_READER } from './application/ports/effective-access-reader.port';
import { RBAC_QUERY_PORT } from './application/ports/rbac-query.port';
import { GetRoleHandler } from './application/queries/get-role/get-role.handler';
import { GetUserAccessHandler } from './application/queries/get-user-access/get-user-access.handler';
import { GetUserEffectiveAccessHandler } from './application/queries/get-user-effective-access/get-user-effective-access.handler';
import { ListPermissionsHandler } from './application/queries/list-permissions/list-permissions.handler';
import { ListRolesHandler } from './application/queries/list-roles/list-roles.handler';
import { EffectiveAccessService } from './application/services/effective-access.service';
import { PermissionCatalogService } from './application/services/permission-catalog.service';
import { AccessCacheInvalidationSubscriber } from './application/subscribers/access-cache-invalidation.subscriber';
import { PERMISSION_REPOSITORY } from './domain/repositories/permission.repository';
import { ROLE_REPOSITORY } from './domain/repositories/role.repository';
import { RedisAccessCache } from './infrastructure/cache/redis-access-cache';
import { PermissionOrmEntity } from './infrastructure/persistence/permission.orm-entity';
import { RoleOrmEntity } from './infrastructure/persistence/role.orm-entity';
import { RolePermissionOrmEntity } from './infrastructure/persistence/role-permission.orm-entity';
import { TypeOrmAssignmentRepository } from './infrastructure/persistence/typeorm-assignment.repository';
import { TypeOrmEffectiveAccessReader } from './infrastructure/persistence/typeorm-effective-access.reader';
import { TypeOrmPermissionRepository } from './infrastructure/persistence/typeorm-permission.repository';
import { TypeOrmRbacQueryAdapter } from './infrastructure/persistence/typeorm-rbac-query.adapter';
import { TypeOrmRoleRepository } from './infrastructure/persistence/typeorm-role.repository';
import { UserRoleOrmEntity } from './infrastructure/persistence/user-role.orm-entity';
import { PermissionsController } from './presentation/controllers/permissions.controller';
import { RolesController } from './presentation/controllers/roles.controller';
import { UserAccessController } from './presentation/controllers/user-access.controller';
import { PermissionsGuard } from './presentation/guards/permissions.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RoleOrmEntity,
      PermissionOrmEntity,
      UserRoleOrmEntity,
      RolePermissionOrmEntity,
    ]),
    RedisModule,
  ],
  controllers: [RolesController, PermissionsController, UserAccessController],
  providers: [
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
    { provide: ROLE_REPOSITORY, useClass: TypeOrmRoleRepository },
    { provide: PERMISSION_REPOSITORY, useClass: TypeOrmPermissionRepository },
    { provide: ASSIGNMENT_REPOSITORY, useClass: TypeOrmAssignmentRepository },
    { provide: EFFECTIVE_ACCESS_READER, useClass: TypeOrmEffectiveAccessReader },
    { provide: ACCESS_CACHE, useClass: RedisAccessCache },
    { provide: RBAC_QUERY_PORT, useClass: TypeOrmRbacQueryAdapter },
  ],
  exports: [PermissionsGuard],
})
export class AuthorizationModule {}
