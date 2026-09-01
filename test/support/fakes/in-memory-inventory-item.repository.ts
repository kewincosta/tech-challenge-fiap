import { InventoryItem } from '../../../src/modules/inventory/domain/entities/inventory-item';
import { InventoryItemStatus } from '../../../src/modules/inventory/domain/inventory-item-status';
import {
  InventoryItemRepository,
  MovementClosureInput,
  PendingConsumptionDto,
} from '../../../src/modules/inventory/domain/repositories/inventory-item.repository';
import { StockMovementKind } from '../../../src/modules/inventory/domain/stock-movement-kind';
import { StockMovementStatus } from '../../../src/modules/inventory/domain/stock-movement-status';
import { InventoryItemId } from '../../../src/modules/inventory/domain/value-objects/inventory-item-id';
import { Sku } from '../../../src/modules/inventory/domain/value-objects/sku';

interface LedgerEntry {
  inventoryItemId: string;
  workOrderId: string | null;
  movementId: string;
  quantity: number;
  kind: StockMovementKind;
  status: StockMovementStatus | null;
  undoesMovementId: string | null;
}

export class InMemoryInventoryItemRepository implements InventoryItemRepository {
  items: InventoryItem[] = [];
  /**
   * `InventoryItem.restore` never attaches movements (design.md), so a fresh instance's own
   * `newMovements` only ever shows what happened in *this* lifecycle - it cannot answer "every
   * consumption ever recorded for this item". This ledger accumulates across every `save()` call,
   * the same role `stock_movements` plays for the real repository.
   */
  private ledger: LedgerEntry[] = [];

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
    for (const movement of item.newMovements) {
      this.ledger.push({
        inventoryItemId: item.id.value,
        workOrderId: movement.workOrderId,
        movementId: movement.id.value,
        quantity: movement.quantity,
        kind: movement.kind,
        status: movement.status,
        undoesMovementId: movement.undoesMovementId,
      });
    }
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

  /** Newest first, net of whatever was already returned against each consumption. */
  async findPendingConsumptions(
    inventoryItemId: InventoryItemId,
    workOrderId: string,
  ): Promise<PendingConsumptionDto[]> {
    const returnedByConsumption = new Map<string, number>();
    for (const entry of this.ledger) {
      if (entry.kind === StockMovementKind.Return && entry.undoesMovementId) {
        returnedByConsumption.set(
          entry.undoesMovementId,
          (returnedByConsumption.get(entry.undoesMovementId) ?? 0) + entry.quantity,
        );
      }
    }
    return Promise.resolve(
      this.ledger
        .filter(
          (entry) =>
            entry.inventoryItemId === inventoryItemId.value &&
            entry.workOrderId === workOrderId &&
            entry.kind === StockMovementKind.Consumption &&
            entry.status === StockMovementStatus.Pending,
        )
        .map((entry) => ({
          movementId: entry.movementId,
          quantity: entry.quantity - (returnedByConsumption.get(entry.movementId) ?? 0),
        }))
        .filter((entry) => entry.quantity > 0)
        .reverse(),
    );
  }

  /** Every ledger entry is mutated in place, matching what a real UPDATE does to the row it
   * represents - callers that captured a reference through `findPendingConsumptions` see this. */
  async settleWorkOrderConsumptions(input: MovementClosureInput): Promise<number> {
    const matches = this.ledger.filter(
      (entry) =>
        entry.workOrderId === input.workOrderId &&
        entry.kind === StockMovementKind.Consumption &&
        entry.status === StockMovementStatus.Pending,
    );
    for (const entry of matches) {
      entry.status = StockMovementStatus.Settled;
    }
    return Promise.resolve(matches.length);
  }

  async writeOffWorkOrderConsumptions(input: MovementClosureInput): Promise<number> {
    const returnedByConsumption = new Map<string, number>();
    for (const entry of this.ledger) {
      if (entry.kind === StockMovementKind.Return && entry.undoesMovementId) {
        returnedByConsumption.set(
          entry.undoesMovementId,
          (returnedByConsumption.get(entry.undoesMovementId) ?? 0) + entry.quantity,
        );
      }
    }
    const candidates = this.ledger.filter(
      (entry) =>
        entry.workOrderId === input.workOrderId &&
        entry.kind === StockMovementKind.Consumption &&
        entry.status === StockMovementStatus.Pending &&
        entry.quantity - (returnedByConsumption.get(entry.movementId) ?? 0) > 0,
    );
    for (const entry of candidates) {
      entry.status = StockMovementStatus.WrittenOff;
    }
    return Promise.resolve(candidates.length);
  }
}
