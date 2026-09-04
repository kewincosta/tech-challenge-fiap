import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  CUSTOMER_QUERY_PORT,
  CustomerQueryPort,
  CustomerSummaryDto,
} from '../../ports/customer-query.port';
import { GetCustomerByUserIdQuery } from './get-customer-by-user-id.query';

// No format guard on userId here, unlike GetCustomerHandler: every current caller (CustomersController
// GET /me, VehiclesController GET /vehicles/me) passes principal.userId straight from the verified
// JWT, never attacker-controlled route input.
@QueryHandler(GetCustomerByUserIdQuery)
export class GetCustomerByUserIdHandler implements IQueryHandler<
  GetCustomerByUserIdQuery,
  CustomerSummaryDto | null
> {
  constructor(@Inject(CUSTOMER_QUERY_PORT) private readonly customerQuery: CustomerQueryPort) {}

  async execute(query: GetCustomerByUserIdQuery): Promise<CustomerSummaryDto | null> {
    return this.customerQuery.getByUserId(query.userId);
  }
}
