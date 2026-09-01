import { InventoryItem } from '../entities/inventory-item';
import { InventoryItemId } from '../value-objects/inventory-item-id';
import { Sku } from '../value-objects/sku';

export interface PendingConsumptionDto {
  /** The consumption's own external id - what a RETURN's `undoes_movement_id` points at. */
  movementId: string;
  quantity: number;
}

export interface InventoryItemRepository {
  /** Never attaches movements - the full ledger is a read model, not part of this aggregate. */
  findById(id: InventoryItemId): Promise<InventoryItem | null>;
  /**
   * Active items only. No `excludingId` - unlike `ServiceRepository.existsActiveByName`, SKU is
   * create-only (`UpdateInventoryItemCommand` has no `sku` field), so there is no rename case that
   * would need to exclude its own row.
   */
  existsActiveBySku(sku: Sku): Promise<boolean>;
  save(item: InventoryItem): Promise<void>;
  /**
   * Locks every addressed item in one query, ordered by internal id - the deadlock guarantee for
   * a withdrawal batch, expressed here rather than left to the caller (design.md's Risks &
   * Concerns): two overlapping batches naming the same items in different orders both take their
   * locks in the same order, so one waits instead of Postgres killing either with `40P01`. An id
   * matching nothing is simply absent from the result, no throw. Must run inside an open
   * transaction - `save()`'s own `inTransaction` if there is an ambient one.
   */
  findAllByIdsForUpdate(ids: InventoryItemId[]): Promise<InventoryItem[]>;
  /**
   * The `CONSUMPTION` movements a return draws from, newest first (spec.md's Assumptions: "the
   * work order's pending consumptions for that item, drawn newest first"). Work-orders has no way
   * to know a movement id - that data lives only in `stock_movements`, inventory's own ledger, so
   * `RestoreStockBatchHandler` resolves it itself rather than the caller supplying it.
   */
  findPendingConsumptions(
    inventoryItemId: InventoryItemId,
    workOrderId: string,
  ): Promise<PendingConsumptionDto[]>;
}

export const INVENTORY_ITEM_REPOSITORY = Symbol('InventoryItemRepository');
