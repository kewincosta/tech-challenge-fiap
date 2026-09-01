import { InventoryItem } from '../../../src/modules/inventory/domain/entities/inventory-item';
import { InventoryItemStatus } from '../../../src/modules/inventory/domain/inventory-item-status';
import { InventoryItemRepository } from '../../../src/modules/inventory/domain/repositories/inventory-item.repository';
import { InventoryItemId } from '../../../src/modules/inventory/domain/value-objects/inventory-item-id';
import { Sku } from '../../../src/modules/inventory/domain/value-objects/sku';

export class InMemoryInventoryItemRepository implements InventoryItemRepository {
  items: InventoryItem[] = [];

  async findById(id: InventoryItemId): Promise<InventoryItem | null> {
    return Promise.resolve(this.items.find((item) => item.id.equals(id)) ?? null);
  }

  async existsActiveBySku(sku: Sku): Promise<boolean> {
    return Promise.resolve(
      this.items.some((item) => item.sku.equals(sku) && item.status === InventoryItemStatus.Active),
    );
  }

  async save(item: InventoryItem): Promise<void> {
    this.items = this.items.filter((existing) => !existing.id.equals(item.id));
    this.items.push(item);
    return Promise.resolve();
  }

  /**
   * No real lock in memory - ids matching nothing are simply absent, same as the real one.
   * Returns fresh clones, not the stored references: the real repository always rebuilds a new
   * `InventoryItem` from the row `findAllByIdsForUpdate` reads, so a caller that mutates a
   * returned item without calling `save()` must not see that mutation "already persisted" here
   * either - a batch handler that validates every line before saving any of them relies on this.
   */
  async findAllByIdsForUpdate(ids: InventoryItemId[]): Promise<InventoryItem[]> {
    return Promise.resolve(
      ids
        .map((id) => this.items.find((item) => item.id.equals(id)))
        .filter((item): item is InventoryItem => item !== undefined)
        .map((item) =>
          InventoryItem.restore({
            id: item.id,
            sku: item.sku,
            name: item.name,
            description: item.description,
            kind: item.kind,
            unitPrice: item.unitPrice,
            quantityOnHand: item.quantityOnHand,
            status: item.status,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
          }),
        ),
    );
  }
}
