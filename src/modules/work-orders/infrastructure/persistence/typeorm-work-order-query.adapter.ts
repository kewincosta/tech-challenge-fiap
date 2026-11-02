import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Money } from '../../../../shared/domain/value-objects/money';
import { CustomerKeyResolver } from '../../../customers';
import { UserKeyResolver } from '../../../identity';
import { InventoryItemKeyResolver } from '../../../inventory';
import { ServiceKeyResolver } from '../../../services';
import { VehicleKeyResolver } from '../../../vehicles';
import {
  WorkOrderBoardFilter,
  WorkOrderBoardPage,
  WorkOrderBudgetDto,
  WorkOrderPartItemDto,
  WorkOrderQueryPort,
  WorkOrderServiceItemDto,
  WorkOrderSummaryDto,
  WorkOrderTrailEntryDto,
} from '../../application/ports/work-order-query.port';

interface WorkOrderRow {
  internal_id: string;
  external_id: string;
  number: string;
  status: string;
  customer_name: string;
  vehicle_plate: string;
  vehicle_brand: string;
  vehicle_model: string;
  vehicle_year: number;
  customer_internal_id: string;
  vehicle_internal_id: string;
  created_by_internal_id: string;
  mechanic_internal_id: string | null;
  charged_total_cents: string | null;
  discount_cents: string;
  discount_note: string | null;
  completed_at: Date | null;
  delivered_at: Date | null;
  canceled_at: Date | null;
  cancellation_reason: string | null;
}

interface ServiceItemRow {
  work_order_id: string;
  external_id: string;
  service_internal_id: string;
  service_name: string;
  unit_price_cents: string;
  budget_round: number | null;
  budgeted_unit_price_cents: string | null;
}

interface PartItemRow {
  work_order_id: string;
  external_id: string;
  inventory_item_internal_id: string;
  sku: string;
  item_name: string;
  planned_quantity: number;
  withdrawn_quantity: number;
  unit_price_cents: string;
  budget_round: number | null;
  budgeted_unit_price_cents: string | null;
}

interface BudgetRow {
  work_order_id: string;
  external_id: string;
  round: number;
  total_cents: string;
  status: string;
  generated_at: Date;
  decided_at: Date | null;
  decided_by_internal_id: string | null;
}

interface TrailRow {
  external_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_internal_id: string | null;
  occurred_at: Date;
  note: string | null;
}

// Reads only work-orders tables (AD-013). The external ids of customers, vehicles, users, services
// and inventory items come from the owners' key resolvers, one batch call per owner per request,
// and are composed here.
const SELECT_WORK_ORDERS = `
  SELECT wo.id AS internal_id, wo.external_id, wo.number, wo.status,
         wo.customer_name, wo.vehicle_plate, wo.vehicle_brand, wo.vehicle_model, wo.vehicle_year,
         wo.customer_id AS customer_internal_id, wo.vehicle_id AS vehicle_internal_id,
         wo.created_by_user_id AS created_by_internal_id,
         wo.assigned_mechanic_user_id AS mechanic_internal_id,
         wo.charged_total_cents, wo.discount_cents, wo.discount_note,
         wo.completed_at, wo.delivered_at, wo.canceled_at, wo.cancellation_reason
    FROM work_orders wo
`;

const SELECT_SERVICE_ITEMS = `
  SELECT wos.work_order_id, wos.external_id, wos.service_id AS service_internal_id,
         wos.service_name, wos.unit_price_cents,
         wob.round AS budget_round, wos.budgeted_unit_price_cents
    FROM work_order_services wos
    LEFT JOIN work_order_budgets wob ON wob.id = wos.budget_id
`;

const SELECT_PART_ITEMS = `
  SELECT wop.work_order_id, wop.external_id, wop.inventory_item_id AS inventory_item_internal_id,
         wop.sku, wop.item_name, wop.planned_quantity, wop.withdrawn_quantity, wop.unit_price_cents,
         wob.round AS budget_round, wop.budgeted_unit_price_cents
    FROM work_order_parts wop
    LEFT JOIN work_order_budgets wob ON wob.id = wop.budget_id
`;

const SELECT_BUDGETS = `
  SELECT wb.work_order_id, wb.external_id, wb.round, wb.total_cents, wb.status, wb.generated_at,
         wb.decided_at, wb.decided_by_user_id AS decided_by_internal_id
    FROM work_order_budgets wb
`;

const SELECT_TRAIL = `
  SELECT we.external_id, we.event_type, we.from_status, we.to_status,
         we.actor_user_id AS actor_internal_id, we.occurred_at, we.note
    FROM work_order_events we
    JOIN work_orders wo ON wo.id = we.work_order_id
`;

function groupByWorkOrder<T extends { work_order_id: string }>(rows: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const group = grouped.get(row.work_order_id);
    if (group) {
      group.push(row);
    } else {
      grouped.set(row.work_order_id, [row]);
    }
  }
  return grouped;
}

@Injectable()
export class TypeOrmWorkOrderQueryAdapter implements WorkOrderQueryPort {
  constructor(
    private readonly dataSource: DataSource,
    private readonly customerKeys: CustomerKeyResolver,
    private readonly vehicleKeys: VehicleKeyResolver,
    private readonly userKeys: UserKeyResolver,
    private readonly serviceKeys: ServiceKeyResolver,
    private readonly inventoryItemKeys: InventoryItemKeyResolver,
  ) {}

  async getByNumber(number: string): Promise<WorkOrderSummaryDto | null> {
    const rows: WorkOrderRow[] = await this.dataSource.query(
      `${SELECT_WORK_ORDERS} WHERE wo.number = $1`,
      [number],
    );
    const [workOrder] = await this.toDtos(rows);
    return workOrder ?? null;
  }

  /**
   * One page of the board. The statuses come in the order to list them in, so a work order sorts
   * by the position of its status, then oldest first; `id` settles two created in the same
   * instant. The total counts every match, so a page past the last still knows how many there are.
   */
  async listBoard(filter: WorkOrderBoardFilter): Promise<WorkOrderBoardPage> {
    const fetchRows: Promise<WorkOrderRow[]> = this.dataSource.query(
      `${SELECT_WORK_ORDERS}
        WHERE wo.status = ANY($1::text[])
        ORDER BY array_position($1::text[], wo.status::text), wo.created_at ASC, wo.id ASC
        LIMIT $2 OFFSET $3`,
      [filter.statuses, filter.pageSize, (filter.page - 1) * filter.pageSize],
    );
    const fetchTotal: Promise<Array<{ total: string }>> = this.dataSource.query(
      `SELECT count(*) AS total FROM work_orders wo WHERE wo.status = ANY($1::text[])`,
      [filter.statuses],
    );
    const [rows, [{ total }]] = await Promise.all([fetchRows, fetchTotal]);
    return { items: await this.toDtos(rows), totalItems: Number(total) };
  }

  /** Whatever the status - a customer's own list includes a cancelled or delivered work order. */
  async listByCustomerId(customerExternalId: string): Promise<WorkOrderSummaryDto[]> {
    const customerInternalId = await this.customerKeys.toInternalId(customerExternalId);
    if (customerInternalId === null) {
      return [];
    }
    const rows: WorkOrderRow[] = await this.dataSource.query(
      `${SELECT_WORK_ORDERS} WHERE wo.customer_id = $1 ORDER BY wo.created_at DESC`,
      [customerInternalId],
    );
    return this.toDtos(rows);
  }

  /**
   * Ordered by `occurred_at` - chronological, the order INV-04's sibling AC in this feature asks for.
   * A use case stamps several events with one clock reading, and `id` (a bigserial) follows the
   * write order, so it breaks those ties.
   */
  async listTrail(number: string): Promise<WorkOrderTrailEntryDto[]> {
    const rows: TrailRow[] = await this.dataSource.query(
      `${SELECT_TRAIL} WHERE wo.number = $1 ORDER BY we.occurred_at ASC, we.id ASC`,
      [number],
    );
    const actors = await this.userKeys.toExternalIds(
      rows.map((row) => row.actor_internal_id).filter((id): id is string => id !== null),
    );
    return rows.map((row) =>
      this.trailToDto(
        row,
        row.actor_internal_id ? (actors.get(row.actor_internal_id) ?? null) : null,
      ),
    );
  }

  /**
   * Reads the items and budgets of all the work orders in three queries, translates every key in
   * one batch call per owner, and composes the summaries. A work order whose customer, vehicle or
   * creator is missing, and an item whose service or inventory item is missing, is left out, as
   * the inner joins this replaces left it out. Items keep the order they were added in.
   */
  private async toDtos(rows: WorkOrderRow[]): Promise<WorkOrderSummaryDto[]> {
    if (rows.length === 0) {
      return [];
    }
    const workOrderIds = rows.map((row) => row.internal_id);
    const fetchServiceRows: Promise<ServiceItemRow[]> = this.dataSource.query(
      `${SELECT_SERVICE_ITEMS} WHERE wos.work_order_id = ANY($1::bigint[]) ORDER BY wos.id ASC`,
      [workOrderIds],
    );
    const fetchPartRows: Promise<PartItemRow[]> = this.dataSource.query(
      `${SELECT_PART_ITEMS} WHERE wop.work_order_id = ANY($1::bigint[]) ORDER BY wop.id ASC`,
      [workOrderIds],
    );
    const fetchBudgetRows: Promise<BudgetRow[]> = this.dataSource.query(
      `${SELECT_BUDGETS} WHERE wb.work_order_id = ANY($1::bigint[]) ORDER BY wb.round ASC`,
      [workOrderIds],
    );
    const [serviceRows, partRows, budgetRows] = await Promise.all([
      fetchServiceRows,
      fetchPartRows,
      fetchBudgetRows,
    ]);

    const customers = await this.customerKeys.toExternalIds(
      rows.map((row) => row.customer_internal_id),
    );
    const vehicles = await this.vehicleKeys.toExternalIds(
      rows.map((row) => row.vehicle_internal_id),
    );
    const users = await this.userKeys.toExternalIds(
      [
        ...rows.map((row) => row.created_by_internal_id),
        ...rows.map((row) => row.mechanic_internal_id),
        ...budgetRows.map((row) => row.decided_by_internal_id),
      ].filter((id): id is string => id !== null),
    );
    const services = await this.serviceKeys.toExternalIds(
      serviceRows.map((row) => row.service_internal_id),
    );
    const inventoryItems = await this.inventoryItemKeys.toExternalIds(
      partRows.map((row) => row.inventory_item_internal_id),
    );

    const serviceRowsByWorkOrder = groupByWorkOrder(serviceRows);
    const partRowsByWorkOrder = groupByWorkOrder(partRows);
    const budgetRowsByWorkOrder = groupByWorkOrder(budgetRows);
    return rows.flatMap((row) => {
      const customerId = customers.get(row.customer_internal_id);
      const vehicleId = vehicles.get(row.vehicle_internal_id);
      const createdByUserId = users.get(row.created_by_internal_id);
      if (customerId === undefined || vehicleId === undefined || createdByUserId === undefined) {
        return [];
      }
      return [
        {
          id: row.external_id,
          number: row.number,
          customerId,
          vehicleId,
          assignedMechanicUserId: row.mechanic_internal_id
            ? (users.get(row.mechanic_internal_id) ?? null)
            : null,
          createdByUserId,
          status: row.status,
          customerName: row.customer_name,
          vehiclePlate: row.vehicle_plate,
          vehicleBrand: row.vehicle_brand,
          vehicleModel: row.vehicle_model,
          vehicleYear: row.vehicle_year,
          serviceItems: (serviceRowsByWorkOrder.get(row.internal_id) ?? []).flatMap((item) => {
            const serviceId = services.get(item.service_internal_id);
            return serviceId === undefined ? [] : [this.serviceItemToDto(item, serviceId)];
          }),
          partItems: (partRowsByWorkOrder.get(row.internal_id) ?? []).flatMap((item) => {
            const inventoryItemId = inventoryItems.get(item.inventory_item_internal_id);
            return inventoryItemId === undefined ? [] : [this.partItemToDto(item, inventoryItemId)];
          }),
          budgets: (budgetRowsByWorkOrder.get(row.internal_id) ?? []).map((budget) =>
            this.budgetToDto(
              budget,
              budget.decided_by_internal_id
                ? (users.get(budget.decided_by_internal_id) ?? null)
                : null,
            ),
          ),
          chargedTotalCents:
            row.charged_total_cents !== null
              ? Money.fromDatabase(row.charged_total_cents).cents
              : null,
          discountCents: Money.fromDatabase(row.discount_cents).cents,
          discountNote: row.discount_note,
          completedAt: row.completed_at,
          deliveredAt: row.delivered_at,
          canceledAt: row.canceled_at,
          cancellationReason: row.cancellation_reason,
        },
      ];
    });
  }

  private serviceItemToDto(row: ServiceItemRow, serviceId: string): WorkOrderServiceItemDto {
    return {
      id: row.external_id,
      serviceId,
      serviceName: row.service_name,
      // Same explicit bigint conversion the mapper does - a read model that skipped it would
      // hand the API a string where the contract says number (AD-002).
      unitPriceCents: Money.fromDatabase(row.unit_price_cents).cents,
      budgetRound: row.budget_round,
      budgetedUnitPriceCents:
        row.budgeted_unit_price_cents !== null
          ? Money.fromDatabase(row.budgeted_unit_price_cents).cents
          : null,
    };
  }

  private partItemToDto(row: PartItemRow, inventoryItemId: string): WorkOrderPartItemDto {
    return {
      id: row.external_id,
      inventoryItemId,
      sku: row.sku,
      itemName: row.item_name,
      plannedQuantity: row.planned_quantity,
      withdrawnQuantity: row.withdrawn_quantity,
      unitPriceCents: Money.fromDatabase(row.unit_price_cents).cents,
      budgetRound: row.budget_round,
      budgetedUnitPriceCents:
        row.budgeted_unit_price_cents !== null
          ? Money.fromDatabase(row.budgeted_unit_price_cents).cents
          : null,
    };
  }

  private budgetToDto(row: BudgetRow, decidedByUserId: string | null): WorkOrderBudgetDto {
    return {
      id: row.external_id,
      round: row.round,
      totalCents: Money.fromDatabase(row.total_cents).cents,
      status: row.status,
      generatedAt: row.generated_at,
      decidedAt: row.decided_at,
      decidedByUserId,
    };
  }

  private trailToDto(row: TrailRow, actorUserId: string | null): WorkOrderTrailEntryDto {
    return {
      id: row.external_id,
      eventType: row.event_type,
      fromStatus: row.from_status,
      toStatus: row.to_status,
      actorUserId,
      occurredAt: row.occurred_at,
      note: row.note,
    };
  }
}
