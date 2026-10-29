import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { InMemoryCustomerRepository } from '../../../../../../test/support/fakes/in-memory-customer.repository';
import { RecordingDomainEventPublisher } from '../../../../../../test/support/fakes/recording-domain-event-publisher';
import { Customer } from '../../../domain/entities/customer';
import { CustomerStatus } from '../../../domain/customer-status';
import { CustomerNotFoundError } from '../../../domain/errors/customer-not-found.error';
import { CustomerDeactivated } from '../../../domain/events/customer-deactivated.event';
import { CustomerId } from '../../../domain/value-objects/customer-id';
import { DeactivateCustomerCommand } from './deactivate-customer.command';
import { DeactivateCustomerUseCase } from './deactivate-customer.use-case';

const CUSTOMER_ID = CustomerId.create('11111111-1111-4111-8111-111111111111');
const USER_ID = '22222222-2222-4222-8222-222222222222';

function makeUseCase() {
  const customers = new InMemoryCustomerRepository();
  const clock = new FakeClock();
  const events = new RecordingDomainEventPublisher();
  const useCase = new DeactivateCustomerUseCase(customers, clock, events);
  return { useCase, customers, clock, events };
}

describe('DeactivateCustomerUseCase', () => {
  it('should deactivate a customer and set the soft-delete marker', async () => {
    const { useCase, customers, clock, events } = makeUseCase();
    const customer = Customer.register({ id: CUSTOMER_ID, userId: USER_ID, now: new Date() });
    customer.pullDomainEvents();
    await customers.save(customer);

    await useCase.execute(new DeactivateCustomerCommand(CUSTOMER_ID.value));

    const deactivated = customers.customers.find((c) => c.id.equals(CUSTOMER_ID))!;
    expect(deactivated.status).toBe(CustomerStatus.Inactive);
    expect(deactivated.deletedAt).not.toBeNull();
    expect(events.published).toEqual([new CustomerDeactivated(CUSTOMER_ID.value, clock.now())]);
  });

  it('should be idempotent when deactivated twice', async () => {
    const { useCase, customers, clock, events } = makeUseCase();
    const customer = Customer.register({ id: CUSTOMER_ID, userId: USER_ID, now: new Date() });
    customer.pullDomainEvents();
    await customers.save(customer);
    await useCase.execute(new DeactivateCustomerCommand(CUSTOMER_ID.value));

    await expect(
      useCase.execute(new DeactivateCustomerCommand(CUSTOMER_ID.value)),
    ).resolves.not.toThrow();
    expect(events.published).toEqual([new CustomerDeactivated(CUSTOMER_ID.value, clock.now())]);
  });

  it('should refuse when the customer does not exist', async () => {
    const { useCase } = makeUseCase();

    await expect(
      useCase.execute(new DeactivateCustomerCommand('00000000-0000-4000-8000-000000000001')),
    ).rejects.toThrow(CustomerNotFoundError);
  });
});
