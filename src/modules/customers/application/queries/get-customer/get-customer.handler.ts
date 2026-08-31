import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { CUSTOMER_QUERY_PORT, CustomerQueryPort, CustomerSummaryDto } from '../../ports/customer-query.port';
import { CustomerId } from '../../../domain/value-objects/customer-id';
import { GetCustomerQuery } from './get-customer.query';

@QueryHandler(GetCustomerQuery)
export class GetCustomerHandler implements IQueryHandler<GetCustomerQuery, CustomerSummaryDto | null> {
  constructor(@Inject(CUSTOMER_QUERY_PORT) private readonly customerQuery: CustomerQueryPort) {}

  async execute(query: GetCustomerQuery): Promise<CustomerSummaryDto | null> {
    try {
      CustomerId.create(query.customerId);
    } catch {
      return null;
    }
    return this.customerQuery.getById(query.customerId);
  }
}
