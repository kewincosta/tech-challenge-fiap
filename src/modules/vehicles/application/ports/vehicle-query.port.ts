export interface VehicleSummaryDto {
  id: string;
  customerId: string;
  plate: string;
  brand: string;
  model: string;
  year: number;
}

export interface VehicleQueryPort {
  getById(externalId: string): Promise<VehicleSummaryDto | null>;
  listByCustomerId(customerExternalId: string): Promise<VehicleSummaryDto[]>;
}

export const VEHICLE_QUERY_PORT = Symbol('VehicleQueryPort');
