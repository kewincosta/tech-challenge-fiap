import { WorkOrderStatus } from '../../domain/work-order-status';

export interface WorkOrderServiceItemDto {
  id: string;
  serviceId: string;
  serviceName: string;
  unitPriceCents: number;
  budgetRound: number | null;
  budgetedUnitPriceCents: number | null;
}

export interface WorkOrderPartItemDto {
  id: string;
  inventoryItemId: string;
  sku: string;
  itemName: string;
  plannedQuantity: number;
  withdrawnQuantity: number;
  unitPriceCents: number;
  budgetRound: number | null;
  budgetedUnitPriceCents: number | null;
}

export interface WorkOrderBudgetDto {
  id: string;
  round: number;
  totalCents: number;
  status: string;
  generatedAt: Date;
  decidedAt: Date | null;
  decidedByUserId: string | null;
}

export interface WorkOrderSummaryDto {
  id: string;
  number: string;
  customerId: string;
  vehicleId: string;
  assignedMechanicUserId: string | null;
  createdByUserId: string;
  status: string;
  customerName: string;
  vehiclePlate: string;
  vehicleBrand: string;
  vehicleModel: string;
  vehicleYear: number;
  serviceItems: WorkOrderServiceItemDto[];
  partItems: WorkOrderPartItemDto[];
  /** Ordered by round. Empty while the work order has no budget yet. */
  budgets: WorkOrderBudgetDto[];
  /** Null before completion (WOC-01). Integer BRL cents. */
  chargedTotalCents: number | null;
  /** Integer BRL cents, zero when no discount was applied. */
  discountCents: number;
  discountNote: string | null;
  completedAt: Date | null;
  deliveredAt: Date | null;
  canceledAt: Date | null;
  cancellationReason: string | null;
}

export interface WorkOrderTrailEntryDto {
  id: string;
  eventType: string;
  fromStatus: string | null;
  toStatus: string | null;
  /** The acting user's external id - never the internal one (AD-001). Null if never recorded. */
  actorUserId: string | null;
  occurredAt: Date;
  note: string | null;
}

/** What the board asks of one read: the statuses to list, in the order to list them, and a page. */
export interface WorkOrderBoardFilter {
  /** Only work orders in these statuses, in this order, and the oldest first within each one. */
  statuses: WorkOrderStatus[];
  /** From 1. */
  page: number;
  pageSize: number;
}

export interface WorkOrderBoardPage {
  items: WorkOrderSummaryDto[];
  /** Every work order in `statuses`, whichever page was asked for. */
  totalItems: number;
}

export interface WorkOrderQueryPort {
  getByNumber(number: string): Promise<WorkOrderSummaryDto | null>;
  listBoard(filter: WorkOrderBoardFilter): Promise<WorkOrderBoardPage>;
  /** Every work order of that customer, whatever its status. Empty when it has none. */
  listByCustomerId(customerExternalId: string): Promise<WorkOrderSummaryDto[]>;
  /** Chronological order. Existence of the work order is the caller's concern, not this port's. */
  listTrail(number: string): Promise<WorkOrderTrailEntryDto[]>;
}
