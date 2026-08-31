import { Inject } from '@nestjs/common';
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs';
import { CLOCK, Clock } from '../../../../../shared/application/ports/clock.port';
import { CustomerNotFoundError } from '../../../domain/errors/customer-not-found.error';
import { CUSTOMER_REPOSITORY, CustomerRepository } from '../../../domain/repositories/customer.repository';
import { CustomerId } from '../../../domain/value-objects/customer-id';
import { DeactivateCustomerCommand } from './deactivate-customer.command';

@CommandHandler(DeactivateCustomerCommand)
export class DeactivateCustomerHandler implements ICommandHandler<DeactivateCustomerCommand, void> {
  constructor(
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: CustomerRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: DeactivateCustomerCommand): Promise<void> {
    const customerId = CustomerId.create(command.customerId);
    const customer = await this.customers.findById(customerId);
    if (!customer) {
      throw new CustomerNotFoundError();
    }
    // Unlike DeactivateUserHandler (identity-foundation), this never touches sessions: a
    // deactivated customer only stops new work orders (event-storming.md rule 13); the backing
    // User's ability to log in is untouched.
    customer.deactivate(this.clock.now());
    await this.customers.save(customer);
    this.eventBus.publishAll(customer.pullDomainEvents());
  }
}
