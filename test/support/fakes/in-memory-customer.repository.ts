import { Customer } from '../../../src/modules/customers/domain/entities/customer';
import { CustomerRepository } from '../../../src/modules/customers/domain/repositories/customer.repository';
import { CustomerId } from '../../../src/modules/customers/domain/value-objects/customer-id';

export class InMemoryCustomerRepository implements CustomerRepository {
  customers: Customer[] = [];

  async findById(id: CustomerId): Promise<Customer | null> {
    return Promise.resolve(this.customers.find((customer) => customer.id.equals(id)) ?? null);
  }

  async existsByUserId(userId: string): Promise<boolean> {
    return Promise.resolve(this.customers.some((customer) => customer.userId === userId));
  }

  async save(customer: Customer): Promise<void> {
    this.customers = this.customers.filter((existing) => !existing.id.equals(customer.id));
    this.customers.push(customer);
    return Promise.resolve();
  }
}
