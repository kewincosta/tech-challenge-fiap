import { CustomerNotFoundError } from '../../../domain/errors/customer-not-found.error';
import { CustomerId } from '../../../domain/value-objects/customer-id';
import { CustomerQueryPort, CustomerSummaryDto } from '../../ports/customer-query.port';
import { GetCustomerQuery } from './get-customer.query';

/**
 * Returns the customer whatever its status, so that "does not exist" (the not-found error) stays
 * apart from "exists but deactivated" (status). Registering a vehicle answers 404 for the first
 * and 422 for the second.
 */
export class GetCustomerUseCase {
  constructor(private readonly customerQuery: CustomerQueryPort) {}

  async execute(query: GetCustomerQuery): Promise<CustomerSummaryDto> {
    try {
      CustomerId.create(query.customerId);
    } catch {
      // A malformed id matches nothing by construction, and a uuid column would throw on it.
      throw new CustomerNotFoundError();
    }
    const customer = await this.customerQuery.getById(query.customerId);
    if (!customer) {
      throw new CustomerNotFoundError();
    }
    return customer;
  }
}
