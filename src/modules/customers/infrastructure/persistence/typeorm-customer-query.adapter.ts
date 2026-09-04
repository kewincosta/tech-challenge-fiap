import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  CustomerQueryPort,
  CustomerSummaryDto,
  ListCustomersFilter,
} from '../../application/ports/customer-query.port';

interface CustomerRow {
  customer_external_id: string;
  user_external_id: string;
  name: string;
  email: string;
  document: string;
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  address_district: string | null;
  address_city: string | null;
  address_state: string | null;
  address_zip_code: string | null;
  phone: string | null;
  status: string;
}

// Raw SQL, not a TypeORM relation: users belongs to the users module, and AD-003 forbids
// importing another module's repository or entities - a plain join against the real table names,
// the same way TypeOrmUserQueryAdapter and TypeOrmAssignmentRepository already read across
// module-owned tables, keeps that boundary at the application layer while still answering one
// filtered read in one query (see design.md's Data Models note).
const SELECT = `
  SELECT c.external_id AS customer_external_id, u.external_id AS user_external_id,
         u.name, u.email, u.document,
         c.address_street, c.address_number, c.address_complement, c.address_district,
         c.address_city, c.address_state, c.address_zip_code, c.phone, c.status
    FROM customers c
    JOIN users u ON u.id = c.user_id
`;

@Injectable()
export class TypeOrmCustomerQueryAdapter implements CustomerQueryPort {
  constructor(private readonly dataSource: DataSource) {}

  // Deliberately NOT filtered by deleted_at IS NULL, unlike getByUserId and listActive: this is
  // the staff/cross-module lookup (GET /customers/:externalId, and RegisterVehicleHandler /
  // UpdateVehicleHandler resolving the owning customer). Those callers need to tell "does not
  // exist" (404, this method returns null) apart from "exists but deactivated" (422, the caller
  // checks .status) - a filtered query collapses both into null and made every deactivated
  // customer register as 404, not 422, discovered by T20's own e2e gate.
  async getById(externalId: string): Promise<CustomerSummaryDto | null> {
    const rows: CustomerRow[] = await this.dataSource.query(`${SELECT} WHERE c.external_id = $1`, [
      externalId,
    ]);
    return rows[0] ? this.toDto(rows[0]) : null;
  }

  async getByUserId(userExternalId: string): Promise<CustomerSummaryDto | null> {
    const rows: CustomerRow[] = await this.dataSource.query(
      `${SELECT} WHERE u.external_id = $1 AND c.deleted_at IS NULL`,
      [userExternalId],
    );
    return rows[0] ? this.toDto(rows[0]) : null;
  }

  async listActive(filter: ListCustomersFilter): Promise<CustomerSummaryDto[]> {
    const rows: CustomerRow[] = await this.dataSource.query(
      `${SELECT}
        WHERE c.deleted_at IS NULL
          AND ($1::varchar IS NULL OR u.document = $1)
          AND ($2::varchar IS NULL OR u.name ILIKE '%' || $2 || '%')
        ORDER BY c.created_at DESC`,
      [filter.document ?? null, filter.name ?? null],
    );
    return rows.map((row) => this.toDto(row));
  }

  private toDto(row: CustomerRow): CustomerSummaryDto {
    return {
      id: row.customer_external_id,
      userId: row.user_external_id,
      name: row.name,
      email: row.email,
      document: row.document,
      address:
        row.address_street !== null
          ? {
              street: row.address_street,
              number: row.address_number!,
              complement: row.address_complement,
              district: row.address_district!,
              city: row.address_city!,
              state: row.address_state!,
              zipCode: row.address_zip_code!,
            }
          : null,
      phoneNumber: row.phone,
      status: row.status,
    };
  }
}
