/**
 * One item the work orders in execution still need. The row carries the item's internal key
 * because `work_order_parts.inventory_item_id` is a column of a `work-orders` table and both sides
 * are infrastructure. No use case or port sees an internal key.
 */
export interface OutstandingDemandRow {
  inventoryItemInternalId: string;
  /** Planned minus withdrawn, summed over the item's parts that count as demand. */
  outstanding: number;
  workOrderNumbers: string[];
}

/**
 * What inventory reads about work orders. Inventory declares it and `work-orders` implements it,
 * because `work-orders` already calls inventory to move stock and a call in the other direction
 * would close a cycle. Every import between the two modules points from `work-orders` to
 * `inventory` (AD-012).
 */
export interface WorkOrderReads {
  /** `null` when no work order has that external id. */
  internalIdOf(workOrderId: string): Promise<string | null>;
  /** Keyed by internal key, valued by external id. Unknown keys are left out. */
  externalIdsOf(internalIds: string[]): Promise<Map<string, string>>;
  /**
   * Per inventory item, what the work orders in execution still need: planned minus withdrawn on
   * parts of approved budget rounds, with the numbers of those work orders. An item nothing is
   * waiting on is absent.
   */
  outstandingDemand(): Promise<OutstandingDemandRow[]>;
  /**
   * The numbers of the work orders that plan the item and are neither delivered nor canceled,
   * ordered by number. Empty when none does.
   */
  openWorkOrderNumbersUsing(inventoryItemInternalId: string): Promise<string[]>;
}

export const WORK_ORDER_READS = Symbol('WorkOrderReads');
