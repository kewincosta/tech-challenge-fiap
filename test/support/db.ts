import { DataSource } from 'typeorm';
import { RefreshTokenOrmEntity } from '../../src/modules/authentication/infrastructure/persistence/refresh-token.orm-entity';
import { SessionOrmEntity } from '../../src/modules/authentication/infrastructure/persistence/session.orm-entity';
import { PermissionOrmEntity } from '../../src/modules/authorization/infrastructure/persistence/permission.orm-entity';
import { RoleOrmEntity } from '../../src/modules/authorization/infrastructure/persistence/role.orm-entity';
import { RolePermissionOrmEntity } from '../../src/modules/authorization/infrastructure/persistence/role-permission.orm-entity';
import { UserRoleOrmEntity } from '../../src/modules/authorization/infrastructure/persistence/user-role.orm-entity';
import { UserOrmEntity } from '../../src/modules/users/infrastructure/persistence/user.orm-entity';
import { CustomerOrmEntity } from '../../src/modules/customers/infrastructure/persistence/customer.orm-entity';
import { VehicleOrmEntity } from '../../src/modules/vehicles/infrastructure/persistence/vehicle.orm-entity';
import { ServiceOrmEntity } from '../../src/modules/services/infrastructure/persistence/service.orm-entity';
import { InventoryItemOrmEntity } from '../../src/modules/inventory/infrastructure/persistence/inventory-item.orm-entity';
import { StockMovementOrmEntity } from '../../src/modules/inventory/infrastructure/persistence/stock-movement.orm-entity';

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
      UserRoleOrmEntity,
      RolePermissionOrmEntity,
      CustomerOrmEntity,
      VehicleOrmEntity,
      ServiceOrmEntity,
      InventoryItemOrmEntity,
      StockMovementOrmEntity,
    ],
  });
}
