import { Clock } from '../../../../../shared/application/ports/clock.port';
import { DomainEventPublisher } from '../../../../../shared/application/ports/domain-event-publisher.port';
import { CustomerNotFoundError } from '../../../domain/errors/customer-not-found.error';
import { CustomerId } from '../../../domain/value-objects/customer-id';
import { CustomerRepository } from '../../ports/customer.repository';
import { DeactivateCustomerCommand } from './deactivate-customer.command';

export class DeactivateCustomerHandler {
  constructor(
    private readonly customers: CustomerRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(command: DeactivateCustomerCommand): Promise<void> {
    const customerId = CustomerId.create(command.customerId);
    const customer = await this.customers.findById(customerId);
    if (!customer) {
      throw new CustomerNotFoundError();
    }
    // Unlike DeactivateUserUseCase (identity-foundation), this never touches sessions: a
    // deactivated customer only stops new work orders (rule 13 of the domain model); the backing
    // User's ability to log in is untouched.
    customer.deactivate(this.clock.now());
    await this.customers.save(customer);
    this.events.publish(customer.pullDomainEvents());
  }
}
