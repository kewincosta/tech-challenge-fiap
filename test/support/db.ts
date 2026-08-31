import { DataSource } from 'typeorm';
import { RefreshTokenOrmEntity } from '../../src/modules/authentication/infrastructure/persistence/refresh-token.orm-entity';
import { SessionOrmEntity } from '../../src/modules/authentication/infrastructure/persistence/session.orm-entity';
import { GroupOrmEntity } from '../../src/modules/authorization/infrastructure/persistence/group.orm-entity';
import { GroupPermissionOrmEntity } from '../../src/modules/authorization/infrastructure/persistence/group-permission.orm-entity';
import { GroupRoleOrmEntity } from '../../src/modules/authorization/infrastructure/persistence/group-role.orm-entity';
import { PermissionOrmEntity } from '../../src/modules/authorization/infrastructure/persistence/permission.orm-entity';
import { RoleOrmEntity } from '../../src/modules/authorization/infrastructure/persistence/role.orm-entity';
import { RolePermissionOrmEntity } from '../../src/modules/authorization/infrastructure/persistence/role-permission.orm-entity';
import { UserGroupOrmEntity } from '../../src/modules/authorization/infrastructure/persistence/user-group.orm-entity';
import { UserRoleOrmEntity } from '../../src/modules/authorization/infrastructure/persistence/user-role.orm-entity';
import { UserOrmEntity } from '../../src/modules/users/infrastructure/persistence/user.orm-entity';

export function createTestDataSource(): DataSource {
  return new DataSource({
    type: 'postgres',
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT),
    username: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    entities: [
      UserOrmEntity,
      SessionOrmEntity,
      RefreshTokenOrmEntity,
      RoleOrmEntity,
      PermissionOrmEntity,
      GroupOrmEntity,
      UserRoleOrmEntity,
      UserGroupOrmEntity,
      GroupRoleOrmEntity,
      RolePermissionOrmEntity,
      GroupPermissionOrmEntity,
    ],
  });
}
