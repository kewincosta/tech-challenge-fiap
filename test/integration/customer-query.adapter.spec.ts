import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { Customer } from '../../src/modules/customers/domain/entities/customer';
import { Address } from '../../src/modules/customers/domain/value-objects/address';
import { CustomerId } from '../../src/modules/customers/domain/value-objects/customer-id';
import { CustomerOrmEntity } from '../../src/modules/customers/infrastructure/persistence/customer.orm-entity';
import { TypeOrmCustomerQueryAdapter } from '../../src/modules/customers/infrastructure/persistence/typeorm-customer-query.adapter';
import { TypeOrmCustomerRepository } from '../../src/modules/customers/infrastructure/persistence/typeorm-customer.repository';
import { TypeOrmUserRepository } from '../../src/modules/users/infrastructure/persistence/typeorm-user.repository';
import { UserOrmEntity } from '../../src/modules/users/infrastructure/persistence/user.orm-entity';
import { uniqueValidCpf } from '../support/factories/document.factory';
import { buildUser } from '../support/factories/user.factory';
import { createTestDataSource } from '../support/db';

let dataSource: DataSource;
let queryAdapter: TypeOrmCustomerQueryAdapter;
let customerRepository: TypeOrmCustomerRepository;
let userRepository: TypeOrmUserRepository;

beforeAll(async () => {
  dataSource = createTestDataSource();
  await dataSource.initialize();
  queryAdapter = new TypeOrmCustomerQueryAdapter(dataSource);
  customerRepository = new TypeOrmCustomerRepository(
    dataSource.getRepository(CustomerOrmEntity),
    dataSource,
  );
  userRepository = new TypeOrmUserRepository(dataSource.getRepository(UserOrmEntity));
});

afterAll(async () => {
  await dataSource.destroy();
});

async function registerCustomer(name: string, document: string): Promise<{ customerId: string; userId: string }> {
  const user = buildUser({ email: `${randomUUID()}@example.com`, name, document });
  await userRepository.save(user);
  const customer = Customer.register({
    id: CustomerId.create(randomUUID()),
    userId: user.id.value,
    address: Address.create({
      street: 'Rua das Flores',
      number: '123',
      district: 'Centro',
      city: 'São Paulo',
      state: 'SP',
      zipCode: '01001000',
    }),
    now: new Date(),
  });
  await customerRepository.save(customer);
  return { customerId: customer.id.value, userId: user.id.value };
}

describe('TypeOrmCustomerQueryAdapter', () => {
  it('should get a customer by its external id with joined identity data', async () => {
    const name = `Jane-${randomUUID()}`;
    const { customerId } = await registerCustomer(name, uniqueValidCpf());

    const found = await queryAdapter.getById(customerId);

    expect(found?.name).toBe(name);
    expect(found?.address?.city).toBe('São Paulo');
    expect(found?.status).toBe('ACTIVE');
  });

  it('should return null for an unknown external id', async () => {
    expect(await queryAdapter.getById(randomUUID())).toBeNull();
  });

  it("should get a customer by its user's external id", async () => {
    const { customerId, userId } = await registerCustomer(`Jane-${randomUUID()}`, uniqueValidCpf());

    const found = await queryAdapter.getByUserId(userId);

    expect(found?.id).toBe(customerId);
  });

  it('should filter the list by a name fragment, case-insensitively', async () => {
    const marker = randomUUID();
    await registerCustomer(`Zed-${marker}-Match`, uniqueValidCpf());
    await registerCustomer(`Other-${randomUUID()}`, uniqueValidCpf());

    const found = await queryAdapter.listActive({ name: marker.toUpperCase() });

    expect(found).toHaveLength(1);
    expect(found[0].name).toContain(marker);
  });

  it('should filter the list by an exact document match', async () => {
    const document = uniqueValidCpf();
    await registerCustomer(`Jane-${randomUUID()}`, document);

    const found = await queryAdapter.listActive({ document });

    expect(found).toHaveLength(1);
    expect(found[0].document).toBe(document);
  });

  it('should exclude a deactivated customer from the list', async () => {
    const document = uniqueValidCpf();
    const { customerId, userId } = await registerCustomer(`Jane-${randomUUID()}`, document);
    const customer = (await customerRepository.findById(CustomerId.create(customerId)))!;
    customer.deactivate(new Date());
    await customerRepository.save(customer);

    const found = await queryAdapter.listActive({ document });

    expect(found).toHaveLength(0);
    expect(await queryAdapter.getByUserId(userId)).toBeNull();
  });
});
