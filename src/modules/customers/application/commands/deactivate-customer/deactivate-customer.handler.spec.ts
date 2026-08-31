import { describe, expect, it } from 'vitest';
import { stubEventBus } from '../../../../../../test/support/fakes/bus.stubs';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { InMemoryCustomerRepository } from '../../../../../../test/support/fakes/in-memory-customer.repository';
import { Customer } from '../../../domain/entities/customer';
import { CustomerStatus } from '../../../domain/customer-status';
import { CustomerNotFoundError } from '../../../domain/errors/customer-not-found.error';
import { CustomerId } from '../../../domain/value-objects/customer-id';
import { DeactivateCustomerCommand } from './deactivate-customer.command';
import { DeactivateCustomerHandler } from './deactivate-customer.handler';

const CUSTOMER_ID = CustomerId.create('11111111-1111-4111-8111-111111111111');
const USER_ID = '22222222-2222-4222-8222-222222222222';

function makeHandler() {
  const customers = new InMemoryCustomerRepository();
  const clock = new FakeClock();
  const eventBus = stubEventBus();
  const handler = new DeactivateCustomerHandler(customers, clock, eventBus.bus);
  return { handler, customers };
}

describe('DeactivateCustomerHandler', () => {
  it('should deactivate a customer and set the soft-delete marker', async () => {
    const { handler, customers } = makeHandler();
    const customer = Customer.register({ id: CUSTOMER_ID, userId: USER_ID, now: new Date() });
    await customers.save(customer);

    await handler.execute(new DeactivateCustomerCommand(CUSTOMER_ID.value));

    const deactivated = customers.customers.find((c) => c.id.equals(CUSTOMER_ID))!;
    expect(deactivated.status).toBe(CustomerStatus.Inactive);
    expect(deactivated.deletedAt).not.toBeNull();
  });

  it('should be idempotent when deactivated twice', async () => {
    const { handler, customers } = makeHandler();
    const customer = Customer.register({ id: CUSTOMER_ID, userId: USER_ID, now: new Date() });
    await customers.save(customer);
    await handler.execute(new DeactivateCustomerCommand(CUSTOMER_ID.value));

    await expect(handler.execute(new DeactivateCustomerCommand(CUSTOMER_ID.value))).resolves.not.toThrow();
  });

  it('should refuse when the customer does not exist', async () => {
    const { handler } = makeHandler();

    await expect(
      handler.execute(new DeactivateCustomerCommand('00000000-0000-4000-8000-000000000001')),
    ).rejects.toThrow(CustomerNotFoundError);
  });
});
