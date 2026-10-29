import { DataSource } from 'typeorm';
import { CustomerKeyResolver } from '../../src/modules/customers';
import { UserKeyResolver } from '../../src/modules/identity';
import { InventoryItemKeyResolver } from '../../src/modules/inventory';
import { ServiceKeyResolver } from '../../src/modules/services';
import { VehicleKeyResolver } from '../../src/modules/vehicles';
import { TypeOrmWorkOrderQueryAdapter } from '../../src/modules/work-orders/infrastructure/persistence/typeorm-work-order-query.adapter';
import { TypeOrmWorkOrderRepository } from '../../src/modules/work-orders/infrastructure/persistence/typeorm-work-order.repository';
import { WorkOrderOrmEntity } from '../../src/modules/work-orders/infrastructure/persistence/work-order.orm-entity';
import { WorkOrderBudgetOrmEntity } from '../../src/modules/work-orders/infrastructure/persistence/work-order-budget.orm-entity';
import { WorkOrderPartOrmEntity } from '../../src/modules/work-orders/infrastructure/persistence/work-order-part.orm-entity';
import { WorkOrderServiceOrmEntity } from '../../src/modules/work-orders/infrastructure/persistence/work-order-service.orm-entity';

/** The work order repository over the test database, with the real key resolvers of its owners. */
export function buildWorkOrderRepository(dataSource: DataSource): TypeOrmWorkOrderRepository {
  return new TypeOrmWorkOrderRepository(
    dataSource.getRepository(WorkOrderOrmEntity),
    dataSource.getRepository(WorkOrderServiceOrmEntity),
    dataSource.getRepository(WorkOrderPartOrmEntity),
    dataSource.getRepository(WorkOrderBudgetOrmEntity),
    dataSource,
    new CustomerKeyResolver(dataSource),
    new VehicleKeyResolver(dataSource),
    new UserKeyResolver(dataSource),
    new ServiceKeyResolver(dataSource),
    new InventoryItemKeyResolver(dataSource),
  );
}

/** The work order query adapter over the test database, with the real key resolvers of its owners. */
export function buildWorkOrderQueryAdapter(dataSource: DataSource): TypeOrmWorkOrderQueryAdapter {
  return new TypeOrmWorkOrderQueryAdapter(
    dataSource,
    new CustomerKeyResolver(dataSource),
    new VehicleKeyResolver(dataSource),
    new UserKeyResolver(dataSource),
    new ServiceKeyResolver(dataSource),
    new InventoryItemKeyResolver(dataSource),
  );
}
