import { describe, expect, it } from 'vitest';
import { CustomerStatus } from '../customer-status';
import { CustomerDeactivated } from '../events/customer-deactivated.event';
import { CustomerRegistered } from '../events/customer-registered.event';
import { CustomerUpdated } from '../events/customer-updated.event';
import { Address } from '../value-objects/address';
import { CustomerId } from '../value-objects/customer-id';
import { PhoneNumber } from '../value-objects/phone-number';
import { Customer } from './customer';

const NOW = new Date('2026-08-31T12:00:00.000Z');
const CUSTOMER_ID = CustomerId.create('11111111-1111-4111-8111-111111111111');
const USER_ID = '22222222-2222-4222-8222-222222222222';

const ADDRESS = Address.create({
  street: 'Rua das Flores',
  number: '123',
  district: 'Centro',
  city: 'São Paulo',
  state: 'SP',
  zipCode: '01001000',
})!;
const PHONE = PhoneNumber.create('11987654321')!;

describe('Customer', () => {
  it('should register a customer and record CustomerRegistered', () => {
    const customer = Customer.register({ id: CUSTOMER_ID, userId: USER_ID, now: NOW });

    const events = customer.pullDomainEvents();
    expect(events).toEqual([new CustomerRegistered(CUSTOMER_ID.value, USER_ID, NOW)]);
    expect(customer.status).toBe(CustomerStatus.Active);
  });

  it('should register with no address and no phone as null', () => {
    const customer = Customer.register({ id: CUSTOMER_ID, userId: USER_ID, now: NOW });

    expect(customer.address).toBeNull();
    expect(customer.phoneNumber).toBeNull();
  });

  it('should register with an address and a phone when supplied', () => {
    const customer = Customer.register({
      id: CUSTOMER_ID,
      userId: USER_ID,
      address: ADDRESS,
      phoneNumber: PHONE,
      now: NOW,
    });

    expect(customer.address).toBe(ADDRESS);
    expect(customer.phoneNumber).toBe(PHONE);
  });

  it('should restore from persisted props with no domain event', () => {
    const customer = Customer.restore({
      id: CUSTOMER_ID,
      userId: USER_ID,
      address: ADDRESS,
      phoneNumber: PHONE,
      status: CustomerStatus.Active,
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
    });

    expect(customer.pullDomainEvents()).toEqual([]);
    expect(customer.userId).toBe(USER_ID);
  });

  it('should update the address only, leaving the phone untouched', () => {
    const customer = Customer.register({
      id: CUSTOMER_ID,
      userId: USER_ID,
      phoneNumber: PHONE,
      now: NOW,
    });
    customer.pullDomainEvents();
    const laterAddress = Address.create({ ...addressInput(), number: '456' })!;

    customer.updateProfile({ address: laterAddress }, NOW);

    expect(customer.address).toBe(laterAddress);
    expect(customer.phoneNumber).toBe(PHONE);
    expect(customer.pullDomainEvents()).toEqual([new CustomerUpdated(CUSTOMER_ID.value, NOW)]);
  });

  it('should update the phone only, leaving the address untouched', () => {
    const customer = Customer.register({
      id: CUSTOMER_ID,
      userId: USER_ID,
      address: ADDRESS,
      now: NOW,
    });
    customer.pullDomainEvents();

    customer.updateProfile({ phoneNumber: PHONE }, NOW);

    expect(customer.phoneNumber).toBe(PHONE);
    expect(customer.address).toBe(ADDRESS);
  });

  it('should deactivate, set the soft-delete marker and record CustomerDeactivated', () => {
    const customer = Customer.register({ id: CUSTOMER_ID, userId: USER_ID, now: NOW });
    customer.pullDomainEvents();

    customer.deactivate(NOW);

    expect(customer.status).toBe(CustomerStatus.Inactive);
    expect(customer.deletedAt).toBe(NOW);
    expect(customer.pullDomainEvents()).toEqual([new CustomerDeactivated(CUSTOMER_ID.value, NOW)]);
  });

  it('should be idempotent when deactivated twice', () => {
    const customer = Customer.register({ id: CUSTOMER_ID, userId: USER_ID, now: NOW });
    customer.deactivate(NOW);
    customer.pullDomainEvents();

    customer.deactivate(NOW);

    expect(customer.pullDomainEvents()).toEqual([]);
  });
});

function addressInput() {
  return {
    street: 'Rua das Flores',
    number: '123',
    district: 'Centro',
    city: 'São Paulo',
    state: 'SP',
    zipCode: '01001000',
  };
}
