import { Clock } from '../../../../../shared/application/ports/clock.port';
import { DomainEventPublisher } from '../../../../../shared/application/ports/domain-event-publisher.port';
import { CustomerNotFoundError } from '../../../domain/errors/customer-not-found.error';
import { Address } from '../../../domain/value-objects/address';
import { CustomerId } from '../../../domain/value-objects/customer-id';
import { PhoneNumber } from '../../../domain/value-objects/phone-number';
import { CustomerRepository } from '../../ports/customer.repository';
import { UpdateCustomerCommand } from './update-customer.command';

export class UpdateCustomerUseCase {
  constructor(
    private readonly customers: CustomerRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(command: UpdateCustomerCommand): Promise<void> {
    const customerId = CustomerId.create(command.customerId);
    const customer = await this.customers.findById(customerId);
    if (!customer) {
      throw new CustomerNotFoundError();
    }

    const address = command.address !== undefined ? Address.create(command.address) : undefined;
    const phoneNumber =
      command.phoneNumber !== undefined ? PhoneNumber.create(command.phoneNumber) : undefined;

    customer.updateProfile({ address, phoneNumber }, this.clock.now());
    await this.customers.save(customer);
    this.events.publish(customer.pullDomainEvents());
  }
}
