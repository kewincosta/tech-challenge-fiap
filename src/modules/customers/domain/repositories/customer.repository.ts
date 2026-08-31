import { Customer } from '../entities/customer';
import { CustomerId } from '../value-objects/customer-id';

export interface CustomerRepository {
  findById(id: CustomerId): Promise<Customer | null>;
  existsByUserId(userId: string): Promise<boolean>;
  save(customer: Customer): Promise<void>;
}

export const CUSTOMER_REPOSITORY = Symbol('CustomerRepository');
