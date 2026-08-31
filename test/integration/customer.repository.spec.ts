import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { Customer } from '../../src/modules/customers/domain/entities/customer';
import { CustomerAlreadyExistsForUserError } from '../../src/modules/customers/domain/errors/customer-already-exists-for-user.error';
import { Address } from '../../src/modules/customers/domain/value-objects/address';
import { CustomerId } from '../../src/modules/customers/domain/value-objects/customer-id';
import { PhoneNumber } from '../../src/modules/customers/domain/value-objects/phone-number';
import { CustomerOrmEntity } from '../../src/modules/customers/infrastructure/persistence/customer.orm-entity';
import { TypeOrmCustomerRepository } from '../../src/modules/customers/infrastructure/persistence/typeorm-customer.repository';
import { TypeOrmUserRepository } from '../../src/modules/users/infrastructure/persistence/typeorm-user.repository';
import { UserOrmEntity } from '../../src/modules/users/infrastructure/persistence/user.orm-entity';
import { uniqueValidCpf } from '../support/factories/document.factory';
import { buildUser } from '../support/factories/user.factory';
import { createTestDataSource } from '../support/db';

let dataSource: DataSource;
let repository: TypeOrmCustomerRepository;
let userRepository: TypeOrmUserRepository;

beforeAll(async () => {
  dataSource = createTestDataSource();
  await dataSource.initialize();
  repository = new TypeOrmCustomerRepository(
    dataSource.getRepository(CustomerOrmEntity),
    dataSource,
  );
  userRepository = new TypeOrmUserRepository(dataSource.getRepository(UserOrmEntity));
});

afterAll(async () => {
  await dataSource.destroy();
});

async function registerUser(): Promise<string> {
  const user = buildUser({ email: `${randomUUID()}@example.com`, document: uniqueValidCpf() });
  await userRepository.save(user);
  return user.id.value;
}

function fullAddress() {
  return Address.create({
    street: 'Rua das Flores',
    number: '123',
    district: 'Centro',
    city: 'São Paulo',
    state: 'SP',
    zipCode: '01001000',
  });
}

describe('TypeOrmCustomerRepository', () => {
  it('should save a customer, resolving the external userId to the internal user_id', async () => {
    const userId = await registerUser();
    const customer = Customer.register({
      id: CustomerId.create(randomUUID()),
      userId,
      now: new Date(),
    });

    await repository.save(customer);

    expect(await repository.existsByUserId(userId)).toBe(true);
  });

  it('should round-trip a save-then-find, address and phone included', async () => {
    const userId = await registerUser();
    const customer = Customer.register({
      id: CustomerId.create(randomUUID()),
      userId,
      address: fullAddress(),
      phoneNumber: PhoneNumber.create('11987654321'),
      now: new Date(),
    });

    await repository.save(customer);
    const found = await repository.findById(customer.id);

    expect(found?.userId).toBe(userId);
    expect(found?.address?.city).toBe('São Paulo');
    expect(found?.phoneNumber?.value).toBe('11987654321');
  });

  it('should throw CustomerAlreadyExistsForUserError on a duplicate user_id', async () => {
    const userId = await registerUser();
    const first = Customer.register({ id: CustomerId.create(randomUUID()), userId, now: new Date() });
    const second = Customer.register({ id: CustomerId.create(randomUUID()), userId, now: new Date() });
    await repository.save(first);

    await expect(repository.save(second)).rejects.toThrow(CustomerAlreadyExistsForUserError);
  });

  it('should throw when saving for a userId that does not exist', async () => {
    const customer = Customer.register({
      id: CustomerId.create(randomUUID()),
      userId: randomUUID(),
      now: new Date(),
    });

    await expect(repository.save(customer)).rejects.toThrow();
  });

  it('should return null/false for an unknown id and userId', async () => {
    expect(await repository.findById(CustomerId.create(randomUUID()))).toBeNull();
    expect(await repository.existsByUserId(randomUUID())).toBe(false);
  });
});
