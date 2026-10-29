import {
  CustomerDirectory,
  CustomerRef,
} from '../../../src/modules/work-orders/application/ports/customer-directory.port';

export class FakeCustomerDirectory implements CustomerDirectory {
  private readonly customers = new Map<string, CustomerRef>();
  private readonly customerIdsByUserId = new Map<string, string>();
  /** Every user id whose customer was asked for, in order. */
  readonly userLookups: string[] = [];

  /** Seeds a customer; give the user account it belongs to for `findByUserId` to find it. */
  add(customer: CustomerRef, userId?: string): this {
    this.customers.set(customer.id, customer);
    if (userId !== undefined) {
      this.customerIdsByUserId.set(userId, customer.id);
    }
    return this;
  }

  async findById(customerId: string): Promise<CustomerRef | null> {
    return Promise.resolve(this.customers.get(customerId) ?? null);
  }

  async findByUserId(userId: string): Promise<{ id: string } | null> {
    this.userLookups.push(userId);
    const customerId = this.customerIdsByUserId.get(userId);
    return Promise.resolve(customerId === undefined ? null : { id: customerId });
  }
}
