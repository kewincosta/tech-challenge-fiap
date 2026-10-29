import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Money } from '../../../../shared/domain/value-objects/money';
import { UserKeyResolver } from '../../../identity';
import {
  InventoryItemSummaryDto,
  InventoryQueryPort,
  StockMovementSummaryDto,
  StockShortageDto,
} from '../../application/ports/inventory-query.port';
import { OutstandingDemandRow, WORK_ORDER_READS, WorkOrderReads } from '../work-order-reads';

interface InventoryItemRow {
  external_id: string;
  sku: string;
  name: string;
  description: string | null;
  kind: string;
  unit_price_cents: string;
  quantity_on_hand: number;
  status: string;
}

interface StockMovementRow {
  external_id: string;
  kind: string;
  quantity: number;
  unit_price_cents: string;
  actor_user_id: string;
  note: string | null;
  occurred_at: Date;
  status: string | null;
  work_order_id: string | null;
  undoes_movement_external_id: string | null;
}

interface ShortageItemRow {
  id: string;
  external_id: string;
  sku: string;
  name: string;
  quantity_on_hand: number;
}

const SELECT_ITEMS = `
  SELECT external_id, sku, name, description, kind, unit_price_cents, quantity_on_hand, status
    FROM inventory_items
`;

const SELECT_ITEMS_BY_INTERNAL_ID = `
  SELECT id, external_id, sku, name, quantity_on_hand
    FROM inventory_items
   WHERE id = ANY($1::bigint[])
`;

// The actor and the work order belong to other modules, so the row carries their internal keys and
// the adapter turns them into UUIDs through their owners (AD-013). LEFT JOIN for the movement a
// RETURN undoes: an INBOUND or ADJUSTMENT movement undoes none.
const SELECT_MOVEMENTS = `
  SELECT sm.external_id, sm.kind, sm.quantity, sm.unit_price_cents,
         sm.actor_user_id, sm.note, sm.occurred_at, sm.status, sm.work_order_id,
         undone.external_id AS undoes_movement_external_id
    FROM stock_movements sm
    JOIN inventory_items ii ON ii.id = sm.inventory_item_id
    LEFT JOIN stock_movements undone ON undone.id = sm.undoes_movement_id
`;

/** The columns behind these keys are foreign keys, so a key without a row means inconsistent data. */
function externalIdOf(externalIds: Map<string, string>, internalId: string): string {
  const externalId = externalIds.get(internalId);
  if (externalId === undefined) {
    throw new Error(`No row for internal key ${internalId}`);
  }
  return externalId;
}

@Injectable()
export class TypeOrmInventoryQueryAdapter implements InventoryQueryPort {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(WORK_ORDER_READS) private readonly workOrderReads: WorkOrderReads,
    private readonly userKeys: UserKeyResolver,
  ) {}

  async getById(externalId: string): Promise<InventoryItemSummaryDto | null> {
    const rows: InventoryItemRow[] = await this.dataSource.query(
      `${SELECT_ITEMS} WHERE external_id = $1`,
      [externalId],
    );
    return rows[0] ? this.itemToDto(rows[0]) : null;
  }

  async listActive(kind?: string): Promise<InventoryItemSummaryDto[]> {
    const rows: InventoryItemRow[] = await this.dataSource.query(
      `${SELECT_ITEMS}
        WHERE status = 'ACTIVE' AND ($1::varchar IS NULL OR kind = $1)
        ORDER BY name ASC`,
      [kind ?? null],
    );
    return rows.map((row) => this.itemToDto(row));
  }

  /**
   * Ordered by `occurred_at` - chronological, the order INV-04 AC1 asks for. Movements that share
   * the instant come back in the order they were written, which `id` follows.
   */
  async listMovements(itemExternalId: string): Promise<StockMovementSummaryDto[]> {
    const rows: StockMovementRow[] = await this.dataSource.query(
      `${SELECT_MOVEMENTS} WHERE ii.external_id = $1 ORDER BY sm.occurred_at ASC, sm.id ASC`,
      [itemExternalId],
    );
    if (rows.length === 0) {
      return [];
    }
    const actors = await this.userKeys.toExternalIds([
      ...new Set(rows.map((row) => row.actor_user_id)),
    ]);
    const workOrderIds = rows.flatMap((row) =>
      row.work_order_id === null ? [] : [row.work_order_id],
    );
    const workOrders =
      workOrderIds.length === 0
        ? new Map<string, string>()
        : await this.workOrderReads.externalIdsOf([...new Set(workOrderIds)]);
    return rows.map((row) => this.movementToDto(row, actors, workOrders));
  }

  // Demand comes from the parts the work orders plan and never from the stock ledger: a PENDING
  // consumption is stock already gone, the opposite of what outstanding means here.
  async listStockShortages(): Promise<StockShortageDto[]> {
    const demand = await this.workOrderReads.outstandingDemand();
    if (demand.length === 0) {
      return [];
    }
    const items: ShortageItemRow[] = await this.dataSource.query(SELECT_ITEMS_BY_INTERNAL_ID, [
      demand.map((row) => row.inventoryItemInternalId),
    ]);
    const itemById = new Map(items.map((item) => [item.id, item]));
    return demand.flatMap((row) => {
      const item = itemById.get(row.inventoryItemInternalId);
      // Short means the work orders still need more than the shelf holds.
      return item && row.outstanding > item.quantity_on_hand ? [this.shortageToDto(item, row)] : [];
    });
  }

  async listOpenWorkOrderNumbersUsing(externalId: string): Promise<string[]> {
    const rows: Array<{ id: string }> = await this.dataSource.query(
      `SELECT id FROM inventory_items WHERE external_id = $1`,
      [externalId],
    );
    return rows.length === 0 ? [] : this.workOrderReads.openWorkOrderNumbersUsing(rows[0].id);
  }

  private itemToDto(row: InventoryItemRow): InventoryItemSummaryDto {
    return {
      id: row.external_id,
      sku: row.sku,
      name: row.name,
      description: row.description,
      kind: row.kind,
      // Same explicit bigint conversion the mapper does - a read model that skipped it would hand
      // the API a string where the contract says number (AD-002).
      unitPriceCents: Money.fromDatabase(row.unit_price_cents).cents,
      quantityOnHand: row.quantity_on_hand,
      status: row.status,
    };
  }

  private movementToDto(
    row: StockMovementRow,
    actors: Map<string, string>,
    workOrders: Map<string, string>,
  ): StockMovementSummaryDto {
    return {
      id: row.external_id,
      kind: row.kind,
      quantity: row.quantity,
      unitPriceCents: Money.fromDatabase(row.unit_price_cents).cents,
      actorUserId: externalIdOf(actors, row.actor_user_id),
      note: row.note,
      occurredAt: row.occurred_at,
      status: row.status,
      workOrderId: row.work_order_id === null ? null : externalIdOf(workOrders, row.work_order_id),
      undoesMovementId: row.undoes_movement_external_id,
    };
  }

  private shortageToDto(item: ShortageItemRow, demand: OutstandingDemandRow): StockShortageDto {
    return {
      inventoryItemId: item.external_id,
      sku: item.sku,
      name: item.name,
      quantityOnHand: item.quantity_on_hand,
      outstandingQuantity: demand.outstanding,
      workOrderNumbers: demand.workOrderNumbers,
    };
  }
}
