export interface InventoryItemSummaryDto {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  kind: string;
  unitPriceCents: number;
  quantityOnHand: number;
  status: string;
}

export interface StockMovementSummaryDto {
  id: string;
  kind: string;
  quantity: number;
  unitPriceCents: number;
  /** The acting user's external id - never the internal one (AD-001). */
  actorUserId: string;
  note: string | null;
  occurredAt: Date;
  /** Only a CONSUMPTION or a RETURN carries either. Null for INBOUND and ADJUSTMENT. */
  status: string | null;
  workOrderId: string | null;
  /** The consumption a RETURN points at, its own external id. Null for every other kind. */
  undoesMovementId: string | null;
}

export interface InventoryQueryPort {
  getById(externalId: string): Promise<InventoryItemSummaryDto | null>;
  listActive(kind?: string): Promise<InventoryItemSummaryDto[]>;
  /** Chronological order. Empty for an item with no movements, not an error. */
  listMovements(itemExternalId: string): Promise<StockMovementSummaryDto[]>;
}

export const INVENTORY_QUERY_PORT = Symbol('InventoryQueryPort');
