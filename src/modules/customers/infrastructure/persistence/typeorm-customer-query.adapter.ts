import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  FindUsersQuery,
  FindUsersUseCase,
  UserKeyResolver,
  UserSummaryDto,
} from '../../../identity';
import {
  CustomerQueryPort,
  CustomerSummaryDto,
  ListCustomersFilter,
} from '../../application/ports/customer-query.port';

interface CustomerRow {
  customer_external_id: string;
  user_internal_id: string;
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

// Reads only `customers` (AD-013): the name, e-mail and document of each customer's user come from
// identity's FindUsersUseCase, in one batch call per request, and the two are composed here.
const SELECT = `
  SELECT c.external_id AS customer_external_id, c.user_id AS user_internal_id,
         c.address_street, c.address_number, c.address_complement, c.address_district,
         c.address_city, c.address_state, c.address_zip_code, c.phone, c.status
    FROM customers c
`;

@Injectable()
export class TypeOrmCustomerQueryAdapter implements CustomerQueryPort {
  constructor(
    private readonly dataSource: DataSource,
    private readonly findUsers: FindUsersUseCase,
    private readonly userKeys: UserKeyResolver,
  ) {}

  // Deliberately NOT filtered by deleted_at IS NULL, unlike getByUserId and listActive: this is
  // the staff/cross-module lookup (GET /customers/:externalId, and RegisterVehicleUseCase /
  // UpdateVehicleUseCase resolving the owning customer). Those callers need to tell "does not
  // exist" (404, this method returns null) apart from "exists but deactivated" (422, the caller
  // checks .status) - a filtered query collapses both into null and made every deactivated
  // customer register as 404, not 422, discovered by T20's own e2e gate.
  async getById(externalId: string): Promise<CustomerSummaryDto | null> {
    const rows: CustomerRow[] = await this.dataSource.query(`${SELECT} WHERE c.external_id = $1`, [
      externalId,
    ]);
    const [customer] = await this.withUsers(rows);
    return customer ?? null;
  }

  async getByUserId(userExternalId: string): Promise<CustomerSummaryDto | null> {
    const userInternalId = await this.userKeys.toInternalId(userExternalId);
    if (userInternalId === null) {
      return null;
    }
    const rows: CustomerRow[] = await this.dataSource.query(
      `${SELECT} WHERE c.user_id = $1 AND c.deleted_at IS NULL`,
      [userInternalId],
    );
    if (rows.length === 0) {
      return null;
    }
    const users = await this.findUsers.execute(new FindUsersQuery([userExternalId]));
    return users[0] ? this.toDto(rows[0], users[0]) : null;
  }

  async listActive(filter: ListCustomersFilter): Promise<CustomerSummaryDto[]> {
    if (filter.name === undefined && filter.document === undefined) {
      const rows: CustomerRow[] = await this.dataSource.query(
        `${SELECT} WHERE c.deleted_at IS NULL ORDER BY c.created_at DESC`,
      );
      return this.withUsers(rows);
    }
    // The filters belong to the user, so the users come first and the customers are read by their
    // keys. The document reaches identity as typed, and a malformed one finds nobody.
    const users = await this.findUsers.execute(
      new FindUsersQuery(undefined, filter.name, filter.document),
    );
    const internalIds = await this.userKeys.toInternalIds(users.map((user) => user.id));
    const rows: CustomerRow[] = await this.dataSource.query(
      `${SELECT}
        WHERE c.deleted_at IS NULL AND c.user_id = ANY($1::bigint[])
        ORDER BY c.created_at DESC`,
      [[...internalIds.values()]],
    );
    const userByInternalId = new Map<string, UserSummaryDto>();
    for (const user of users) {
      const internalId = internalIds.get(user.id);
      if (internalId !== undefined) {
        userByInternalId.set(internalId, user);
      }
    }
    return this.compose(rows, userByInternalId);
  }

  /** Reads the users of already-fetched customers in one batch and composes the two. */
  private async withUsers(rows: CustomerRow[]): Promise<CustomerSummaryDto[]> {
    if (rows.length === 0) {
      return [];
    }
    const externalIds = await this.userKeys.toExternalIds(rows.map((row) => row.user_internal_id));
    const users = await this.findUsers.execute(new FindUsersQuery([...externalIds.values()]));
    const userByExternalId = new Map(users.map((user) => [user.id, user]));
    const userByInternalId = new Map<string, UserSummaryDto>();
    for (const [internalId, externalId] of externalIds) {
      const user = userByExternalId.get(externalId);
      if (user) {
        userByInternalId.set(internalId, user);
      }
    }
    return this.compose(rows, userByInternalId);
  }

  // A customer whose user is missing is left out, as the inner join it replaces left it out.
  private compose(
    rows: CustomerRow[],
    userByInternalId: Map<string, UserSummaryDto>,
  ): CustomerSummaryDto[] {
    return rows.flatMap((row) => {
      const user = userByInternalId.get(row.user_internal_id);
      return user ? [this.toDto(row, user)] : [];
    });
  }

  private toDto(row: CustomerRow, user: UserSummaryDto): CustomerSummaryDto {
    return {
      id: row.customer_external_id,
      userId: user.id,
      name: user.name,
      email: user.email,
      document: user.document,
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
