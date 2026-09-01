import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Money } from '../../../../shared/domain/value-objects/money';
import {
  InventoryItemSummaryDto,
  InventoryQueryPort,
  StockMovementSummaryDto,
} from '../../application/ports/inventory-query.port';

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
  actor_external_id: string;
  note: string | null;
  occurred_at: Date;
  status: string | null;
  work_order_external_id: string | null;
  undoes_movement_external_id: string | null;
}

const SELECT_ITEMS = `
  SELECT external_id, sku, name, description, kind, unit_price_cents, quantity_on_hand, status
    FROM inventory_items
`;

// Raw SQL, not a TypeORM relation: users belongs to the users module, and AD-003 forbids
// importing another module's repository or entities across module boundaries at this layer -
// a plain join, the same way TypeOrmCustomerQueryAdapter reads across users, keeps the ledger
// read to one query while still returning the actor's external id, never the internal one.
// LEFT JOINs for the two consumption-era references: an INBOUND or ADJUSTMENT movement carries
// neither a work order nor a movement it undoes.
const SELECT_MOVEMENTS = `
  SELECT sm.external_id, sm.kind, sm.quantity, sm.unit_price_cents,
         u.external_id AS actor_external_id, sm.note, sm.occurred_at, sm.status,
         wo.external_id AS work_order_external_id,
         undone.external_id AS undoes_movement_external_id
    FROM stock_movements sm
    JOIN inventory_items ii ON ii.id = sm.inventory_item_id
    JOIN users u ON u.id = sm.actor_user_id
    LEFT JOIN work_orders wo ON wo.id = sm.work_order_id
    LEFT JOIN stock_movements undone ON undone.id = sm.undoes_movement_id
`;

@Injectable()
export class TypeOrmInventoryQueryAdapter implements InventoryQueryPort {
  constructor(private readonly dataSource: DataSource) {}

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

  /** Ordered by `occurred_at` - chronological, the order INV-04 AC1 asks for. */
  async listMovements(itemExternalId: string): Promise<StockMovementSummaryDto[]> {
    const rows: StockMovementRow[] = await this.dataSource.query(
      `${SELECT_MOVEMENTS} WHERE ii.external_id = $1 ORDER BY sm.occurred_at ASC`,
      [itemExternalId],
    );
    return rows.map((row) => this.movementToDto(row));
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

  private movementToDto(row: StockMovementRow): StockMovementSummaryDto {
    return {
      id: row.external_id,
      kind: row.kind,
      quantity: row.quantity,
      unitPriceCents: Money.fromDatabase(row.unit_price_cents).cents,
      actorUserId: row.actor_external_id,
      note: row.note,
      occurredAt: row.occurred_at,
      status: row.status,
      workOrderId: row.work_order_external_id,
      undoesMovementId: row.undoes_movement_external_id,
    };
  }
}
