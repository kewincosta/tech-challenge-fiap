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
}

export const INVENTORY_ITEM_REPOSITORY = Symbol('InventoryItemRepository');
