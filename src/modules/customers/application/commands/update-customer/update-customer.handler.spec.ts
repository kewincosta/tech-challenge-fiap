import { describe, expect, it } from 'vitest';
import { stubEventBus } from '../../../../../../test/support/fakes/bus.stubs';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { InMemoryCustomerRepository } from '../../../../../../test/support/fakes/in-memory-customer.repository';
import { Customer } from '../../../domain/entities/customer';
import { CustomerNotFoundError } from '../../../domain/errors/customer-not-found.error';
import { InvalidAddressError } from '../../../domain/errors/invalid-address.error';
import { Address } from '../../../domain/value-objects/address';
import { CustomerId } from '../../../domain/value-objects/customer-id';
import { PhoneNumber } from '../../../domain/value-objects/phone-number';
import { UpdateCustomerCommand } from './update-customer.command';
import { UpdateCustomerHandler } from './update-customer.handler';

const CUSTOMER_ID = CustomerId.create('11111111-1111-4111-8111-111111111111');
const USER_ID = '22222222-2222-4222-8222-222222222222';

function makeHandler() {
  const customers = new InMemoryCustomerRepository();
  const clock = new FakeClock();
  const eventBus = stubEventBus();
  const handler = new UpdateCustomerHandler(customers, clock, eventBus.bus);
  return { handler, customers, clock };
}

async function seedCustomer(customers: InMemoryCustomerRepository) {
  const customer = Customer.register({
    id: CUSTOMER_ID,
    userId: USER_ID,
    phoneNumber: PhoneNumber.create('11987654321'),
    now: new Date('2026-08-31T00:00:00.000Z'),
  });
  customer.pullDomainEvents();
  await customers.save(customer);
  return customer;
}

describe('UpdateCustomerHandler', () => {
  it('should update the address only, leaving the phone untouched', async () => {
    const { handler, customers } = makeHandler();
    const seeded = await seedCustomer(customers);

    await handler.execute(
      new UpdateCustomerCommand(CUSTOMER_ID.value, {
        street: 'Rua das Flores',
        number: '123',
        district: 'Centro',
        city: 'São Paulo',
        state: 'SP',
        zipCode: '01001000',
      }),
    );

    const updated = customers.customers.find((c) => c.id.equals(CUSTOMER_ID))!;
    expect(updated.address?.city).toBe('São Paulo');
    expect(updated.phoneNumber).toBe(seeded.phoneNumber);
  });

  it('should update the phone only, leaving the address untouched', async () => {
    const { handler, customers } = makeHandler();
    await seedCustomer(customers);

    await handler.execute(new UpdateCustomerCommand(CUSTOMER_ID.value, undefined, '11933334444'));

    const updated = customers.customers.find((c) => c.id.equals(CUSTOMER_ID))!;
    expect(updated.phoneNumber?.value).toBe('11933334444');
    expect(updated.address).toBeNull();
  });

  it('should propagate InvalidAddressError for a malformed address', async () => {
    const { handler, customers } = makeHandler();
    await seedCustomer(customers);

    await expect(
      handler.execute(
        new UpdateCustomerCommand(CUSTOMER_ID.value, {
          street: '',
          number: '',
          district: '',
          city: '',
          state: 'ZZ',
          zipCode: '123',
        }),
      ),
    ).rejects.toThrow(InvalidAddressError);
  });

  it('should refuse when the customer does not exist', async () => {
    const { handler } = makeHandler();

    await expect(
      handler.execute(new UpdateCustomerCommand('00000000-0000-4000-8000-000000000001')),
    ).rejects.toThrow(CustomerNotFoundError);
  });
});
