export interface WorkOrderServiceItemDto {
  id: string;
  serviceId: string;
  serviceName: string;
  unitPriceCents: number;
}

export interface WorkOrderPartItemDto {
  id: string;
  inventoryItemId: string;
  sku: string;
  itemName: string;
  plannedQuantity: number;
  withdrawnQuantity: number;
  unitPriceCents: number;
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

export interface WorkOrderQueryPort {
  getByNumber(number: string): Promise<WorkOrderSummaryDto | null>;
  listByStatus(status?: string): Promise<WorkOrderSummaryDto[]>;
  /** Chronological order. Existence of the work order is the caller's concern, not this port's. */
  listTrail(number: string): Promise<WorkOrderTrailEntryDto[]>;
}

export const WORK_ORDER_QUERY_PORT = Symbol('WorkOrderQueryPort');
