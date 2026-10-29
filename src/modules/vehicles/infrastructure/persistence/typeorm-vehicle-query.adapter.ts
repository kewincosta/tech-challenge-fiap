import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CustomerKeyResolver } from '../../../customers';
import { VehicleQueryPort, VehicleSummaryDto } from '../../application/ports/vehicle-query.port';

interface VehicleRow {
  vehicle_external_id: string;
  customer_internal_id: string;
  plate: string;
  brand: string;
  model: string;
  year: number;
}

// Reads only `vehicles` (AD-013): the owner's external id comes from the customers key resolver,
// in one batch call per request.
const SELECT = `
  SELECT v.external_id AS vehicle_external_id, v.customer_id AS customer_internal_id,
         v.plate, v.brand, v.model, v.year
    FROM vehicles v
`;

@Injectable()
export class TypeOrmVehicleQueryAdapter implements VehicleQueryPort {
  constructor(
    private readonly dataSource: DataSource,
    private readonly customerKeys: CustomerKeyResolver,
  ) {}

  async getById(externalId: string): Promise<VehicleSummaryDto | null> {
    const rows: VehicleRow[] = await this.dataSource.query(
      `${SELECT} WHERE v.external_id = $1 AND v.deleted_at IS NULL`,
      [externalId],
    );
    const [vehicle] = await this.withOwners(rows);
    return vehicle ?? null;
  }

  async listByCustomerId(customerExternalId: string): Promise<VehicleSummaryDto[]> {
    const customerInternalId = await this.customerKeys.toInternalId(customerExternalId);
    if (customerInternalId === null) {
      return [];
    }
    const rows: VehicleRow[] = await this.dataSource.query(
      `${SELECT} WHERE v.customer_id = $1 AND v.deleted_at IS NULL ORDER BY v.created_at DESC`,
      [customerInternalId],
    );
    return this.withOwners(rows);
  }

  // A vehicle whose owner is missing is left out, as the inner join it replaces left it out.
  private async withOwners(rows: VehicleRow[]): Promise<VehicleSummaryDto[]> {
    if (rows.length === 0) {
      return [];
    }
    const customerExternalIds = await this.customerKeys.toExternalIds(
      rows.map((row) => row.customer_internal_id),
    );
    return rows.flatMap((row) => {
      const customerId = customerExternalIds.get(row.customer_internal_id);
      return customerId === undefined ? [] : [this.toDto(row, customerId)];
    });
  }

  private toDto(row: VehicleRow, customerId: string): VehicleSummaryDto {
    return {
      id: row.vehicle_external_id,
      customerId,
      plate: row.plate,
      brand: row.brand,
      model: row.model,
      year: row.year,
    };
  }
}
