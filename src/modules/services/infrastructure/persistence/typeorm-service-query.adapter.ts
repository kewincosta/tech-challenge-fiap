import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Money } from '../../../../shared/domain/value-objects/money';
import { ServiceQueryPort, ServiceSummaryDto } from '../../application/ports/service-query.port';

interface ServiceRow {
  external_id: string;
  name: string;
  description: string | null;
  price_cents: string;
  estimated_duration_minutes: number;
  status: string;
}

const SELECT = `
  SELECT external_id, name, description, price_cents, estimated_duration_minutes, status
    FROM services
`;

@Injectable()
export class TypeOrmServiceQueryAdapter implements ServiceQueryPort {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Deliberately not filtered by status: this is the staff and cross-module lookup, and feature 5
   * needs "does not exist" (null) to stay distinct from "exists but deactivated" (status) so it can
   * refuse rule 18 precisely. Only listActive filters. Same split customer-and-vehicle-registry
   * arrived at by fixing a bug; here it is the design.
   */
  async getById(externalId: string): Promise<ServiceSummaryDto | null> {
    const rows: ServiceRow[] = await this.dataSource.query(`${SELECT} WHERE external_id = $1`, [
      externalId,
    ]);
    return rows[0] ? this.toDto(rows[0]) : null;
  }

  async listActive(): Promise<ServiceSummaryDto[]> {
    const rows: ServiceRow[] = await this.dataSource.query(
      `${SELECT} WHERE status = 'ACTIVE' ORDER BY name ASC`,
    );
    return rows.map((row) => this.toDto(row));
  }

  private toDto(row: ServiceRow): ServiceSummaryDto {
    return {
      id: row.external_id,
      name: row.name,
      description: row.description,
      // Same explicit bigint conversion the mapper does - a read model that skipped it would hand
      // the API a string where the contract says number (AD-002).
      priceCents: Money.fromDatabase(row.price_cents).cents,
      estimatedDurationMinutes: row.estimated_duration_minutes,
      status: row.status,
    };
  }
}
