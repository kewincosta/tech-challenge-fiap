import { CustomerQueryPort, CustomerSummaryDto } from '../../ports/customer-query.port';
import { ListCustomersQuery } from './list-customers.query';

export class ListCustomersUseCase {
  constructor(private readonly customerQuery: CustomerQueryPort) {}

  async execute(query: ListCustomersQuery): Promise<CustomerSummaryDto[]> {
    return this.customerQuery.listActive({ name: query.name, document: query.document });
  }
}
