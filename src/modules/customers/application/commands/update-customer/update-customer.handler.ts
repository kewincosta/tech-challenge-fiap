import { Inject } from '@nestjs/common';
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs';
import { CLOCK, Clock } from '../../../../../shared/application/ports/clock.port';
import { CustomerNotFoundError } from '../../../domain/errors/customer-not-found.error';
import {
  CUSTOMER_REPOSITORY,
  CustomerRepository,
} from '../../../domain/repositories/customer.repository';
import { Address } from '../../../domain/value-objects/address';
import { CustomerId } from '../../../domain/value-objects/customer-id';
import { PhoneNumber } from '../../../domain/value-objects/phone-number';
import { UpdateCustomerCommand } from './update-customer.command';

@CommandHandler(UpdateCustomerCommand)
export class UpdateCustomerHandler implements ICommandHandler<UpdateCustomerCommand, void> {
  constructor(
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: CustomerRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly eventBus: EventBus,
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
    this.eventBus.publishAll(customer.pullDomainEvents());
  }
}
