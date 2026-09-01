import { Money } from '../../../../shared/domain/value-objects/money';
import { InventoryItem } from '../../domain/entities/inventory-item';
import { InventoryItemKind } from '../../domain/inventory-item-kind';
import { InventoryItemStatus } from '../../domain/inventory-item-status';
import { InventoryItemId } from '../../domain/value-objects/inventory-item-id';
import { Sku } from '../../domain/value-objects/sku';
import { StockQuantity } from '../../domain/value-objects/stock-quantity';
import { InventoryItemOrmEntity } from './inventory-item.orm-entity';
import { StockMovementOrmEntity } from './stock-movement.orm-entity';

export interface InventoryItemOrmSnapshot {
  itemRow: InventoryItemOrmEntity;
  /** Only `item.newMovements` - never the item's full history (design.md: it is a read model). */
  movementRows: StockMovementOrmEntity[];
}

export class InventoryItemMapper {
  /** Restored with no movements attached - `findById` never loads them (design.md). */
  static toDomain(row: InventoryItemOrmEntity): InventoryItem {
    return InventoryItem.restore({
      id: InventoryItemId.create(row.externalId),
      sku: Sku.create(row.sku),
      name: row.name,
      description: row.description,
      kind: row.kind as InventoryItemKind,
      // The explicit conversion AD-002 requires: the driver returns a bigint column as a string
      // (service.mapper.ts's same pattern, repeated for this feature's own Money-backed column).
      unitPrice: Money.fromDatabase(row.unitPriceCents),
      quantityOnHand: StockQuantity.of(row.quantityOnHand),
      status: row.status as InventoryItemStatus,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  static toOrm(item: InventoryItem): InventoryItemOrmSnapshot {
    const itemRow = new InventoryItemOrmEntity();
    itemRow.externalId = item.id.value;
    itemRow.sku = item.sku.value;
    itemRow.name = item.name;
    itemRow.description = item.description;
    itemRow.kind = item.kind;
    itemRow.unitPriceCents = String(item.unitPrice.cents);
    itemRow.quantityOnHand = item.quantityOnHand.units;
    itemRow.status = item.status;
    itemRow.createdAt = item.createdAt;
    itemRow.updatedAt = item.updatedAt;

    const movementRows = item.newMovements.map((movement) => {
      const movementRow = new StockMovementOrmEntity();
      movementRow.externalId = movement.id.value;
      movementRow.kind = movement.kind;
      movementRow.quantity = movement.quantity;
      movementRow.unitPriceCents = String(movement.unitPrice.cents);
      movementRow.status = movement.status;
      movementRow.occurredAt = movement.occurredAt;
      movementRow.note = movement.note;
      // inventoryItemInternalId, actorInternalId, workOrderInternalId and undoesMovementInternalId
      // are all resolved by the repository, which is the only place that knows the parent's
      // freshly-saved internal id and can look an external id up against another table - the
      // mapper stays pure. `movement.workOrderId` and `movement.undoesMovementId` are external
      // ids on the domain entity despite the ORM column names.
      return movementRow;
    });

    return { itemRow, movementRows };
  }
}
