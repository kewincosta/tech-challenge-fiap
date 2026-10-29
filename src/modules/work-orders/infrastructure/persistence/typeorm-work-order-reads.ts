import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { currentEntityManager } from '../../../../shared/infrastructure/database/typeorm-transaction-runner';
import { OutstandingDemandRow, WorkOrderReads } from '../../../inventory';

interface OutstandingDemandSqlRow {
  inventory_item_id: string;
  outstanding: string;
  work_order_numbers: string[];
}

// Demand is read straight off work_order_parts, only from approved rounds of work orders in
// execution: a draft item, a part on a rejected round and a part on a round still awaiting
// approval are all excluded by the two JOIN conditions, not filtered afterward. The shelf
// comparison that turns demand into a shortage belongs to inventory, which owns the shelf.
const SELECT_OUTSTANDING_DEMAND = `
  SELECT wop.inventory_item_id,
         SUM(wop.planned_quantity - wop.withdrawn_quantity) AS outstanding,
         array_agg(DISTINCT wo.number) AS work_order_numbers
    FROM work_order_parts wop
    JOIN work_orders wo ON wo.id = wop.work_order_id AND wo.status = 'IN_EXECUTION'
    JOIN work_order_budgets wob ON wob.id = wop.budget_id AND wob.status = 'APPROVED'
   WHERE wop.planned_quantity > wop.withdrawn_quantity
   GROUP BY wop.inventory_item_id
`;

// Every non-terminal status counts: a part planned on a work order still in flight is what blocks
// the deactivation of an item, whether that work order has been budgeted yet or not. DELIVERED
// and CANCELED are closed books, so an item they name is free to leave the catalog. EXISTS lists a
// work order once however many parts of the item it plans, and the order is the ORDER BY's own.
const SELECT_OPEN_WORK_ORDERS_USING_ITEM = `
  SELECT wo.number
    FROM work_orders wo
   WHERE wo.status NOT IN ('DELIVERED', 'CANCELED')
     AND EXISTS (
       SELECT 1
         FROM work_order_parts wop
        WHERE wop.work_order_id = wo.id AND wop.inventory_item_id = $1
     )
   ORDER BY wo.number
`;

/**
 * Answers inventory's questions about work orders from the tables `work-orders` owns. It reads
 * through the transaction open on this async context, if any, so a work order written earlier in
 * the caller's transaction is found inside it (AD-008).
 */
@Injectable()
export class TypeOrmWorkOrderReads implements WorkOrderReads {
  constructor(private readonly dataSource: DataSource) {}

  async internalIdOf(workOrderId: string): Promise<string | null> {
    const rows: Array<{ id: string }> = await this.runner().query(
      `SELECT id FROM work_orders WHERE external_id = $1`,
      [workOrderId],
    );
    return rows[0]?.id ?? null;
  }

  async externalIdsOf(internalIds: string[]): Promise<Map<string, string>> {
    const rows: Array<{ id: string; external_id: string }> = await this.runner().query(
      `SELECT id, external_id FROM work_orders WHERE id = ANY($1::bigint[])`,
      [internalIds],
    );
    return new Map(rows.map((row) => [row.id, row.external_id]));
  }

  async outstandingDemand(): Promise<OutstandingDemandRow[]> {
    const rows: OutstandingDemandSqlRow[] = await this.runner().query(SELECT_OUTSTANDING_DEMAND);
    return rows.map((row) => ({
      inventoryItemInternalId: row.inventory_item_id,
      // integer arithmetic in Postgres, but the driver hands a SUM(...) back as a string.
      outstanding: Number(row.outstanding),
      workOrderNumbers: row.work_order_numbers,
    }));
  }

  async openWorkOrderNumbersUsing(inventoryItemInternalId: string): Promise<string[]> {
    const rows: Array<{ number: string }> = await this.runner().query(
      SELECT_OPEN_WORK_ORDERS_USING_ITEM,
      [inventoryItemInternalId],
    );
    return rows.map((row) => row.number);
  }

  private runner(): EntityManager | DataSource {
    return currentEntityManager() ?? this.dataSource;
  }
}
