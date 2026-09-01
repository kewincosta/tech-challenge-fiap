import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Money } from '../../../../shared/domain/value-objects/money';
import {
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
  customer_external_id: string;
  vehicle_external_id: string;
  created_by_external_id: string;
  mechanic_external_id: string | null;
}

interface ServiceItemRow {
  external_id: string;
  service_external_id: string;
  service_name: string;
  unit_price_cents: string;
}

interface PartItemRow {
  external_id: string;
  inventory_item_external_id: string;
  sku: string;
  item_name: string;
  planned_quantity: number;
  withdrawn_quantity: number;
  unit_price_cents: string;
}

interface TrailRow {
  external_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_external_id: string | null;
  occurred_at: Date;
  note: string | null;
}

// Raw SQL, not TypeORM relations: customers, vehicles and users belong to other modules, and
// AD-003 forbids importing another module's repository or entities - a plain join, the same way
// TypeOrmCustomerQueryAdapter and TypeOrmInventoryQueryAdapter already read across module-owned
// tables, keeps that boundary at the application layer while answering one filtered read in one
// query (design.md's Data Models note).
const SELECT_WORK_ORDERS = `
  SELECT wo.id AS internal_id, wo.external_id, wo.number, wo.status,
         wo.customer_name, wo.vehicle_plate, wo.vehicle_brand, wo.vehicle_model, wo.vehicle_year,
         c.external_id AS customer_external_id, v.external_id AS vehicle_external_id,
         creator.external_id AS created_by_external_id, mechanic.external_id AS mechanic_external_id
    FROM work_orders wo
    JOIN customers c ON c.id = wo.customer_id
    JOIN vehicles v ON v.id = wo.vehicle_id
    JOIN users creator ON creator.id = wo.created_by_user_id
    LEFT JOIN users mechanic ON mechanic.id = wo.assigned_mechanic_user_id
`;

const SELECT_SERVICE_ITEMS = `
  SELECT wos.external_id, s.external_id AS service_external_id, wos.service_name, wos.unit_price_cents
    FROM work_order_services wos
    JOIN services s ON s.id = wos.service_id
`;

const SELECT_PART_ITEMS = `
  SELECT wop.external_id, ii.external_id AS inventory_item_external_id, wop.sku, wop.item_name,
         wop.planned_quantity, wop.withdrawn_quantity, wop.unit_price_cents
    FROM work_order_parts wop
    JOIN inventory_items ii ON ii.id = wop.inventory_item_id
`;

const SELECT_TRAIL = `
  SELECT we.external_id, we.event_type, we.from_status, we.to_status,
         actor.external_id AS actor_external_id, we.occurred_at, we.note
    FROM work_order_events we
    JOIN work_orders wo ON wo.id = we.work_order_id
    LEFT JOIN users actor ON actor.id = we.actor_user_id
`;

@Injectable()
export class TypeOrmWorkOrderQueryAdapter implements WorkOrderQueryPort {
  constructor(private readonly dataSource: DataSource) {}

  async getByNumber(number: string): Promise<WorkOrderSummaryDto | null> {
    const rows: WorkOrderRow[] = await this.dataSource.query(
      `${SELECT_WORK_ORDERS} WHERE wo.number = $1`,
      [number],
    );
    return rows[0] ? this.toDto(rows[0]) : null;
  }

  async listByStatus(status?: string): Promise<WorkOrderSummaryDto[]> {
    const rows: WorkOrderRow[] = await this.dataSource.query(
      `${SELECT_WORK_ORDERS} WHERE ($1::varchar IS NULL OR wo.status = $1) ORDER BY wo.created_at DESC`,
      [status ?? null],
    );
    return Promise.all(rows.map((row) => this.toDto(row)));
  }

  /** Ordered by `occurred_at` - chronological, the order INV-04's sibling AC in this feature asks for. */
  async listTrail(number: string): Promise<WorkOrderTrailEntryDto[]> {
    const rows: TrailRow[] = await this.dataSource.query(
      `${SELECT_TRAIL} WHERE wo.number = $1 ORDER BY we.occurred_at ASC`,
      [number],
    );
    return rows.map((row) => this.trailToDto(row));
  }

  private async toDto(row: WorkOrderRow): Promise<WorkOrderSummaryDto> {
    const fetchServiceRows: Promise<ServiceItemRow[]> = this.dataSource.query(
      `${SELECT_SERVICE_ITEMS} WHERE wos.work_order_id = $1`,
      [row.internal_id],
    );
    const fetchPartRows: Promise<PartItemRow[]> = this.dataSource.query(
      `${SELECT_PART_ITEMS} WHERE wop.work_order_id = $1`,
      [row.internal_id],
    );
    const [serviceRows, partRows] = await Promise.all([fetchServiceRows, fetchPartRows]);
    return {
      id: row.external_id,
      number: row.number,
      customerId: row.customer_external_id,
      vehicleId: row.vehicle_external_id,
      assignedMechanicUserId: row.mechanic_external_id,
      createdByUserId: row.created_by_external_id,
      status: row.status,
      customerName: row.customer_name,
      vehiclePlate: row.vehicle_plate,
      vehicleBrand: row.vehicle_brand,
      vehicleModel: row.vehicle_model,
      vehicleYear: row.vehicle_year,
      serviceItems: serviceRows.map((serviceRow) => this.serviceItemToDto(serviceRow)),
      partItems: partRows.map((partRow) => this.partItemToDto(partRow)),
    };
  }

  private serviceItemToDto(row: ServiceItemRow): WorkOrderServiceItemDto {
    return {
      id: row.external_id,
      serviceId: row.service_external_id,
      serviceName: row.service_name,
      // Same explicit bigint conversion the mapper does - a read model that skipped it would
      // hand the API a string where the contract says number (AD-002).
      unitPriceCents: Money.fromDatabase(row.unit_price_cents).cents,
    };
  }

  private partItemToDto(row: PartItemRow): WorkOrderPartItemDto {
    return {
      id: row.external_id,
      inventoryItemId: row.inventory_item_external_id,
      sku: row.sku,
      itemName: row.item_name,
      plannedQuantity: row.planned_quantity,
      withdrawnQuantity: row.withdrawn_quantity,
      unitPriceCents: Money.fromDatabase(row.unit_price_cents).cents,
    };
  }

  private trailToDto(row: TrailRow): WorkOrderTrailEntryDto {
    return {
      id: row.external_id,
      eventType: row.event_type,
      fromStatus: row.from_status,
      toStatus: row.to_status,
      actorUserId: row.actor_external_id,
      occurredAt: row.occurred_at,
      note: row.note,
    };
  }
}
