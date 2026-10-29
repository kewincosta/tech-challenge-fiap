export { GetInventoryItemHandler } from './application/queries/get-inventory-item/get-inventory-item.handler';
export { GetInventoryItemQuery } from './application/queries/get-inventory-item/get-inventory-item.query';
export type { InventoryItemSummaryDto } from './application/ports/inventory-query.port';
export { InventoryItemNotFoundError } from './domain/errors/inventory-item-not-found.error';
export { InventoryItemKeyResolver } from './infrastructure/persistence/inventory-item-key-resolver';
export { WORK_ORDER_READS } from './infrastructure/work-order-reads';
export type { OutstandingDemandRow, WorkOrderReads } from './infrastructure/work-order-reads';
export { InventoryModule } from './inventory.module';
