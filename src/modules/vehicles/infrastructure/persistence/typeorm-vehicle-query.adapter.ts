import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { VehicleQueryPort, VehicleSummaryDto } from '../../application/ports/vehicle-query.port';

interface VehicleRow {
  vehicle_external_id: string;
  customer_external_id: string;
  plate: string;
  brand: string;
  model: string;
  year: number;
}

// Raw SQL, not a TypeORM relation - same AD-003 exception TypeOrmCustomerQueryAdapter already
// uses to read customers.user_id joined to users: customers belongs to the customers module.
const SELECT = `
  SELECT v.external_id AS vehicle_external_id, c.external_id AS customer_external_id,
         v.plate, v.brand, v.model, v.year
    FROM vehicles v
    JOIN customers c ON c.id = v.customer_id
`;

@Injectable()
export class TypeOrmVehicleQueryAdapter implements VehicleQueryPort {
  constructor(private readonly dataSource: DataSource) {}

  async getById(externalId: string): Promise<VehicleSummaryDto | null> {
    const rows: VehicleRow[] = await this.dataSource.query(
      `${SELECT} WHERE v.external_id = $1 AND v.deleted_at IS NULL`,
      [externalId],
    );
    return rows[0] ? this.toDto(rows[0]) : null;
  }

  async listByCustomerId(customerExternalId: string): Promise<VehicleSummaryDto[]> {
    const rows: VehicleRow[] = await this.dataSource.query(
      `${SELECT} WHERE c.external_id = $1 AND v.deleted_at IS NULL ORDER BY v.created_at DESC`,
      [customerExternalId],
    );
    return rows.map((row) => this.toDto(row));
  }

  private toDto(row: VehicleRow): VehicleSummaryDto {
    return {
      id: row.vehicle_external_id,
      customerId: row.customer_external_id,
      plate: row.plate,
      brand: row.brand,
      model: row.model,
      year: row.year,
    };
  }
}
