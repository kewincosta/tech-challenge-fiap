import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { GetCustomerByUserIdHandler } from '../../src/modules/customers/application/queries/get-customer-by-user-id/get-customer-by-user-id.handler';
import { GetCustomerByUserIdQuery } from '../../src/modules/customers/application/queries/get-customer-by-user-id/get-customer-by-user-id.query';
import { GetCustomerHandler } from '../../src/modules/customers/application/queries/get-customer/get-customer.handler';
import { GetCustomerQuery } from '../../src/modules/customers/application/queries/get-customer/get-customer.query';
import { ListCustomersHandler } from '../../src/modules/customers/application/queries/list-customers/list-customers.handler';
import { ListCustomersQuery } from '../../src/modules/customers/application/queries/list-customers/list-customers.query';
import { Customer } from '../../src/modules/customers/domain/entities/customer';
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
let getCustomerHandler: GetCustomerHandler;
let getCustomerByUserIdHandler: GetCustomerByUserIdHandler;
let listCustomersHandler: ListCustomersHandler;
let customerRepository: TypeOrmCustomerRepository;
let userRepository: TypeOrmUserRepository;

beforeAll(async () => {
  dataSource = createTestDataSource();
  await dataSource.initialize();
  const queryAdapter = new TypeOrmCustomerQueryAdapter(dataSource);
  getCustomerHandler = new GetCustomerHandler(queryAdapter);
  getCustomerByUserIdHandler = new GetCustomerByUserIdHandler(queryAdapter);
  listCustomersHandler = new ListCustomersHandler(queryAdapter);
  customerRepository = new TypeOrmCustomerRepository(
    dataSource.getRepository(CustomerOrmEntity),
    dataSource,
  );
  userRepository = new TypeOrmUserRepository(dataSource.getRepository(UserOrmEntity));
});

afterAll(async () => {
  await dataSource.destroy();
});

async function registerCustomer(name: string, document: string) {
  const user = buildUser({ email: `${randomUUID()}@example.com`, name, document });
  await userRepository.save(user);
  const customer = Customer.register({
    id: CustomerId.create(randomUUID()),
    userId: user.id.value,
    now: new Date(),
  });
  await customerRepository.save(customer);
  return { customerId: customer.id.value, userId: user.id.value };
}

describe('Customer read queries', () => {
  it('should get a customer by its external id', async () => {
    const { customerId } = await registerCustomer(`Jane-${randomUUID()}`, uniqueValidCpf());

    const found = await getCustomerHandler.execute(new GetCustomerQuery(customerId));

    expect(found?.id).toBe(customerId);
  });

  it('should return null for a customer id that does not exist', async () => {
    expect(await getCustomerHandler.execute(new GetCustomerQuery(randomUUID()))).toBeNull();
  });

  it('should return null for a malformed customer id, not throw', async () => {
    expect(await getCustomerHandler.execute(new GetCustomerQuery('not-a-uuid'))).toBeNull();
  });

  it("should get a customer by its user's external id", async () => {
    const { customerId, userId } = await registerCustomer(`Jane-${randomUUID()}`, uniqueValidCpf());

    const found = await getCustomerByUserIdHandler.execute(new GetCustomerByUserIdQuery(userId));

    expect(found?.id).toBe(customerId);
  });

  it('should list customers filtered by name', async () => {
    const marker = randomUUID();
    await registerCustomer(`Zed-${marker}`, uniqueValidCpf());

    const found = await listCustomersHandler.execute(new ListCustomersQuery(marker));

    expect(found).toHaveLength(1);
  });

  it('should return an empty list for a malformed document filter, not throw', async () => {
    expect(await listCustomersHandler.execute(new ListCustomersQuery(undefined, '123'))).toEqual(
      [],
    );
  });
});
