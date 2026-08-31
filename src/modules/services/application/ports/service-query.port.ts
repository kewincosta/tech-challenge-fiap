export interface ServiceSummaryDto {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  estimatedDurationMinutes: number;
  status: string;
}

export interface ServiceQueryPort {
  /** Unfiltered by status: feature 5 must tell "does not exist" apart from "deactivated". */
  getById(externalId: string): Promise<ServiceSummaryDto | null>;
  listActive(): Promise<ServiceSummaryDto[]>;
}

export const SERVICE_QUERY_PORT = Symbol('ServiceQueryPort');
