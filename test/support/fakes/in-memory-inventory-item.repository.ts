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
}
