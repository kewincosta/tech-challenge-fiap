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
import { CustomerNotFoundError } from '../../src/modules/customers/domain/errors/customer-not-found.error';
import { CustomerId } from '../../src/modules/customers/domain/value-objects/customer-id';
import { CustomerOrmEntity } from '../../src/modules/customers/infrastructure/persistence/customer.orm-entity';
import { TypeOrmCustomerQueryAdapter } from '../../src/modules/customers/infrastructure/persistence/typeorm-customer-query.adapter';
import { TypeOrmCustomerRepository } from '../../src/modules/customers/infrastructure/persistence/typeorm-customer.repository';
import { FindUsersUseCase, UserKeyResolver } from '../../src/modules/identity';
import { TypeOrmUserQueryAdapter } from '../../src/modules/identity/users/infrastructure/persistence/typeorm-user-query.adapter';
import { TypeOrmUserRepository } from '../../src/modules/identity/users/infrastructure/persistence/typeorm-user.repository';
import { UserOrmEntity } from '../../src/modules/identity/users/infrastructure/persistence/user.orm-entity';
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
  const queryAdapter = new TypeOrmCustomerQueryAdapter(
    dataSource,
    new FindUsersUseCase(
      new TypeOrmUserQueryAdapter(dataSource.getRepository(UserOrmEntity), dataSource),
    ),
    new UserKeyResolver(dataSource),
  );
  getCustomerHandler = new GetCustomerHandler(queryAdapter);
  getCustomerByUserIdHandler = new GetCustomerByUserIdHandler(queryAdapter);
  listCustomersHandler = new ListCustomersHandler(queryAdapter);
  customerRepository = new TypeOrmCustomerRepository(
    dataSource.getRepository(CustomerOrmEntity),
    new UserKeyResolver(dataSource),
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

  it('should refuse a customer id that does not exist with the customer not-found error', async () => {
    await expect(getCustomerHandler.execute(new GetCustomerQuery(randomUUID()))).rejects.toThrow(
      CustomerNotFoundError,
    );
  });

  it('should refuse a malformed customer id with the customer not-found error, not a database error', async () => {
    await expect(getCustomerHandler.execute(new GetCustomerQuery('not-a-uuid'))).rejects.toThrow(
      CustomerNotFoundError,
    );
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
