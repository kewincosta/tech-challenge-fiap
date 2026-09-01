import { InventoryItem } from '../entities/inventory-item';
import { InventoryItemId } from '../value-objects/inventory-item-id';
import { Sku } from '../value-objects/sku';

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
}

export const INVENTORY_ITEM_REPOSITORY = Symbol('InventoryItemRepository');
