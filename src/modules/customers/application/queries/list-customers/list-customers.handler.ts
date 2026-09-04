import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { PersonDocument } from '../../../../users/domain/value-objects/person-document';
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
    let document: string | undefined;
    if (query.document !== undefined) {
      try {
        document = PersonDocument.create(query.document).value;
      } catch {
        // A malformed document filter matches nobody by construction - no error, empty result,
        // consistent with ListUsersHandler's tolerance for free-typed search input.
        return [];
      }
    }
    return this.customerQuery.listActive({ name: query.name, document });
  }
}
