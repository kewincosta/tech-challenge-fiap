import { DataSource } from 'typeorm';
import { CustomerKeyResolver } from '../../src/modules/customers';
import { UserKeyResolver } from '../../src/modules/identity';
import { InventoryItemKeyResolver } from '../../src/modules/inventory';
import { ServiceKeyResolver } from '../../src/modules/services';
import { VehicleKeyResolver } from '../../src/modules/vehicles';
import {
  WorkOrderQueryPort,
  WorkOrderSummaryDto,
} from '../../src/modules/work-orders/application/ports/work-order-query.port';
import { WorkOrderStatus } from '../../src/modules/work-orders/domain/work-order-status';
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

/**
 * The last page of the board for `statuses`, at 100 a page. The test database keeps every work
 * order any run opened, tens of thousands of them, so a spec cannot find the one it just saved on
 * the first page. The board lists the oldest first, so the newest work order of a status closes
 * its last page.
 */
export async function readLastBoardPage(
  queryAdapter: Pick<WorkOrderQueryPort, 'listBoard'>,
  statuses: WorkOrderStatus[],
): Promise<WorkOrderSummaryDto[]> {
  const pageSize = 100;
  const first = await queryAdapter.listBoard({ statuses, page: 1, pageSize });
  const lastPage = Math.ceil(first.totalItems / pageSize);
  if (lastPage <= 1) {
    return first.items;
  }
  return (await queryAdapter.listBoard({ statuses, page: lastPage, pageSize })).items;
}
