import { Global, Module } from '@nestjs/common';
import { WORK_ORDER_READS } from '../inventory';
import { TypeOrmWorkOrderReads } from './infrastructure/persistence/typeorm-work-order-reads';

/**
 * Binds the interface inventory declares to the implementation `work-orders` owns. The module is
 * global and `app.module.ts` imports it once, so `InventoryModule` injects the token without
 * importing anything from `work-orders` (AD-012). A `forwardRef` would make `inventory.module.ts`
 * import `work-orders.module.ts`, a cycle between the two modules.
 */
@Global()
@Module({
  providers: [{ provide: WORK_ORDER_READS, useClass: TypeOrmWorkOrderReads }],
  exports: [WORK_ORDER_READS],
})
export class WorkOrderReadsModule {}
