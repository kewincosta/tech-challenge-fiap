import { Customer } from '../../domain/entities/customer';
import { CustomerId } from '../../domain/value-objects/customer-id';

export interface CustomerRepository {
  findById(id: CustomerId): Promise<Customer | null>;
  existsByUserId(userId: string): Promise<boolean>;
  save(customer: Customer): Promise<void>;
}
