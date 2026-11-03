import { CustomerNotFoundError } from '../../../domain/errors/customer-not-found.error';
import { CustomerQueryPort, CustomerSummaryDto } from '../../ports/customer-query.port';
import { GetCustomerByUserIdQuery } from './get-customer-by-user-id.query';

// No format guard on userId here, unlike GetCustomerUseCase: every current caller (CustomersController
// GET /me, VehiclesController GET /vehicles/me) passes principal.userId straight from the verified
// JWT, never attacker-controlled route input.
export class GetCustomerByUserIdUseCase {
  constructor(private readonly customerQuery: CustomerQueryPort) {}

  async execute(query: GetCustomerByUserIdQuery): Promise<CustomerSummaryDto> {
    const customer = await this.customerQuery.getByUserId(query.userId);
    if (!customer) {
      throw new CustomerNotFoundError();
    }
    return customer;
  }
}
