import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisModule } from '../../shared/infrastructure/redis/redis.module';
import { AddUserToGroupHandler } from './application/commands/add-user-to-group/add-user-to-group.handler';
import { AssignRoleToUserHandler } from './application/commands/assign-role-to-user/assign-role-to-user.handler';
import { CreateGroupHandler } from './application/commands/create-group/create-group.handler';
import { CreateRoleHandler } from './application/commands/create-role/create-role.handler';
import { DeleteGroupHandler } from './application/commands/delete-group/delete-group.handler';
import { DeleteRoleHandler } from './application/commands/delete-role/delete-role.handler';
import { RemoveUserFromGroupHandler } from './application/commands/remove-user-from-group/remove-user-from-group.handler';
import { RevokeRoleFromUserHandler } from './application/commands/revoke-role-from-user/revoke-role-from-user.handler';
import { SetGroupPermissionsHandler } from './application/commands/set-group-permissions/set-group-permissions.handler';
import { SetGroupRolesHandler } from './application/commands/set-group-roles/set-group-roles.handler';
import { SetRolePermissionsHandler } from './application/commands/set-role-permissions/set-role-permissions.handler';
import { UpdateGroupHandler } from './application/commands/update-group/update-group.handler';
import { UpdateRoleHandler } from './application/commands/update-role/update-role.handler';
import { ACCESS_CACHE } from './application/ports/access-cache.port';
import { ASSIGNMENT_REPOSITORY } from './application/ports/assignment.repository';
import { EFFECTIVE_ACCESS_READER } from './application/ports/effective-access-reader.port';
import { RBAC_QUERY_PORT } from './application/ports/rbac-query.port';
import { GetGroupHandler } from './application/queries/get-group/get-group.handler';
import { GetRoleHandler } from './application/queries/get-role/get-role.handler';
import { GetUserAccessHandler } from './application/queries/get-user-access/get-user-access.handler';
import { GetUserEffectiveAccessHandler } from './application/queries/get-user-effective-access/get-user-effective-access.handler';
import { ListGroupsHandler } from './application/queries/list-groups/list-groups.handler';
import { ListPermissionsHandler } from './application/queries/list-permissions/list-permissions.handler';
import { ListRolesHandler } from './application/queries/list-roles/list-roles.handler';
import { EffectiveAccessService } from './application/services/effective-access.service';
import { PermissionCatalogService } from './application/services/permission-catalog.service';
import { AccessCacheInvalidationSubscriber } from './application/subscribers/access-cache-invalidation.subscriber';
import { GROUP_REPOSITORY } from './domain/repositories/group.repository';
import { PERMISSION_REPOSITORY } from './domain/repositories/permission.repository';
import { ROLE_REPOSITORY } from './domain/repositories/role.repository';
import { RedisAccessCache } from './infrastructure/cache/redis-access-cache';
import { GroupOrmEntity } from './infrastructure/persistence/group.orm-entity';
import { GroupPermissionOrmEntity } from './infrastructure/persistence/group-permission.orm-entity';
import { GroupRoleOrmEntity } from './infrastructure/persistence/group-role.orm-entity';
import { PermissionOrmEntity } from './infrastructure/persistence/permission.orm-entity';
import { RoleOrmEntity } from './infrastructure/persistence/role.orm-entity';
import { RolePermissionOrmEntity } from './infrastructure/persistence/role-permission.orm-entity';
import { TypeOrmAssignmentRepository } from './infrastructure/persistence/typeorm-assignment.repository';
import { TypeOrmEffectiveAccessReader } from './infrastructure/persistence/typeorm-effective-access.reader';
import { TypeOrmGroupRepository } from './infrastructure/persistence/typeorm-group.repository';
import { TypeOrmPermissionRepository } from './infrastructure/persistence/typeorm-permission.repository';
import { TypeOrmRbacQueryAdapter } from './infrastructure/persistence/typeorm-rbac-query.adapter';
import { TypeOrmRoleRepository } from './infrastructure/persistence/typeorm-role.repository';
import { UserGroupOrmEntity } from './infrastructure/persistence/user-group.orm-entity';
import { UserRoleOrmEntity } from './infrastructure/persistence/user-role.orm-entity';
import { GroupsController } from './presentation/controllers/groups.controller';
import { PermissionsController } from './presentation/controllers/permissions.controller';
import { RolesController } from './presentation/controllers/roles.controller';
import { UserAccessController } from './presentation/controllers/user-access.controller';
import { PermissionsGuard } from './presentation/guards/permissions.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RoleOrmEntity,
      PermissionOrmEntity,
      GroupOrmEntity,
      UserRoleOrmEntity,
      UserGroupOrmEntity,
      GroupRoleOrmEntity,
      RolePermissionOrmEntity,
      GroupPermissionOrmEntity,
    ]),
    RedisModule,
  ],
  controllers: [RolesController, GroupsController, PermissionsController, UserAccessController],
  providers: [
    CreateRoleHandler,
    UpdateRoleHandler,
    DeleteRoleHandler,
    SetRolePermissionsHandler,
    CreateGroupHandler,
    UpdateGroupHandler,
    DeleteGroupHandler,
    SetGroupRolesHandler,
    SetGroupPermissionsHandler,
    AssignRoleToUserHandler,
    RevokeRoleFromUserHandler,
    AddUserToGroupHandler,
    RemoveUserFromGroupHandler,
    ListRolesHandler,
    GetRoleHandler,
    ListGroupsHandler,
    GetGroupHandler,
    ListPermissionsHandler,
    GetUserAccessHandler,
    GetUserEffectiveAccessHandler,
    EffectiveAccessService,
    PermissionCatalogService,
    AccessCacheInvalidationSubscriber,
    PermissionsGuard,
    { provide: ROLE_REPOSITORY, useClass: TypeOrmRoleRepository },
    { provide: GROUP_REPOSITORY, useClass: TypeOrmGroupRepository },
    { provide: PERMISSION_REPOSITORY, useClass: TypeOrmPermissionRepository },
    { provide: ASSIGNMENT_REPOSITORY, useClass: TypeOrmAssignmentRepository },
    { provide: EFFECTIVE_ACCESS_READER, useClass: TypeOrmEffectiveAccessReader },
    { provide: ACCESS_CACHE, useClass: RedisAccessCache },
    { provide: RBAC_QUERY_PORT, useClass: TypeOrmRbacQueryAdapter },
  ],
  exports: [PermissionsGuard],
})
export class AuthorizationModule {}
