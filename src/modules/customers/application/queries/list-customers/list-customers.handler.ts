import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  CUSTOMER_QUERY_PORT,
  CustomerQueryPort,
  CustomerSummaryDto,
} from '../../ports/customer-query.port';
import { ListCustomersQuery } from './list-customers.query';

@QueryHandler(ListCustomersQuery)
export class ListCustomersHandler implements IQueryHandler<
  ListCustomersQuery,
  CustomerSummaryDto[]
> {
  constructor(@Inject(CUSTOMER_QUERY_PORT) private readonly customerQuery: CustomerQueryPort) {}

  async execute(query: ListCustomersQuery): Promise<CustomerSummaryDto[]> {
    return this.customerQuery.listActive({ name: query.name, document: query.document });
  }
}
