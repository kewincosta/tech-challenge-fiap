import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { CustomerSummaryDto } from '../../src/modules/customers/application/ports/customer-query.port';
import { Customer } from '../../src/modules/customers/domain/entities/customer';
import { Address } from '../../src/modules/customers/domain/value-objects/address';
import { CustomerId } from '../../src/modules/customers/domain/value-objects/customer-id';
import { CustomerOrmEntity } from '../../src/modules/customers/infrastructure/persistence/customer.orm-entity';
import { TypeOrmCustomerQueryAdapter } from '../../src/modules/customers/infrastructure/persistence/typeorm-customer-query.adapter';
import { TypeOrmCustomerRepository } from '../../src/modules/customers/infrastructure/persistence/typeorm-customer.repository';
import {
  FindUsersQuery,
  FindUsersUseCase,
  UserKeyResolver,
  UserSummaryDto,
} from '../../src/modules/identity';
import { UserId } from '../../src/modules/identity/users/domain/value-objects/user-id';
import { TypeOrmUserQueryAdapter } from '../../src/modules/identity/users/infrastructure/persistence/typeorm-user-query.adapter';
import { TypeOrmUserRepository } from '../../src/modules/identity/users/infrastructure/persistence/typeorm-user.repository';
import { UserOrmEntity } from '../../src/modules/identity/users/infrastructure/persistence/user.orm-entity';
import { uniqueValidCpf } from '../support/factories/document.factory';
import { buildUser } from '../support/factories/user.factory';
import { createTestDataSource } from '../support/db';

// Records what the adapter asks identity for, in order, so a spec can show that a list reads its
// users in one batch call.
const calls: string[] = [];

class RecordingFindUsers extends FindUsersUseCase {
  override execute(query: FindUsersQuery): Promise<UserSummaryDto[]> {
    calls.push('findUsers');
    return super.execute(query);
  }
}

class RecordingUserKeyResolver extends UserKeyResolver {
  override toInternalId(externalId: string): Promise<string | null> {
    calls.push('toInternalId');
    return super.toInternalId(externalId);
  }

  override toInternalIds(externalIds: string[]): Promise<Map<string, string>> {
    calls.push('toInternalIds');
    return super.toInternalIds(externalIds);
  }

  override toExternalIds(internalIds: string[]): Promise<Map<string, string>> {
    calls.push('toExternalIds');
    return super.toExternalIds(internalIds);
  }
}

let dataSource: DataSource;
let queryAdapter: TypeOrmCustomerQueryAdapter;
let customerRepository: TypeOrmCustomerRepository;
let userRepository: TypeOrmUserRepository;

beforeAll(async () => {
  dataSource = createTestDataSource();
  await dataSource.initialize();
  queryAdapter = new TypeOrmCustomerQueryAdapter(
    dataSource,
    new RecordingFindUsers(
      new TypeOrmUserQueryAdapter(dataSource.getRepository(UserOrmEntity), dataSource),
    ),
    new RecordingUserKeyResolver(dataSource),
  );
  customerRepository = new TypeOrmCustomerRepository(
    dataSource.getRepository(CustomerOrmEntity),
    new UserKeyResolver(dataSource),
  );
  userRepository = new TypeOrmUserRepository(dataSource.getRepository(UserOrmEntity));
});

beforeEach(() => {
  calls.length = 0;
});

afterAll(async () => {
  await dataSource.destroy();
});

interface RegisteredCustomer {
  customerId: string;
  userId: string;
  name: string;
  email: string;
  document: string;
}

async function registerCustomer(
  name: string,
  document: string,
  createdAt: Date = new Date(),
): Promise<RegisteredCustomer> {
  const email = `${randomUUID()}@example.com`;
  const user = buildUser({ email, name, document });
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
    now: createdAt,
  });
  await customerRepository.save(customer);
  return { customerId: customer.id.value, userId: user.id.value, name, email, document };
}

// What the adapter must show of a customer registered by registerCustomer: the customer's own
// columns and the name, e-mail and document of its own user.
function summaryOf(registered: RegisteredCustomer): CustomerSummaryDto {
  return {
    id: registered.customerId,
    userId: registered.userId,
    name: registered.name,
    email: registered.email,
    document: registered.document,
    address: {
      street: 'Rua das Flores',
      number: '123',
      complement: null,
      district: 'Centro',
      city: 'São Paulo',
      state: 'SP',
      zipCode: '01001000',
    },
    phoneNumber: null,
    status: 'ACTIVE',
  };
}

async function deactivateCustomer(customerId: string): Promise<void> {
  const customer = (await customerRepository.findById(CustomerId.create(customerId)))!;
  customer.deactivate(new Date());
  await customerRepository.save(customer);
}

function maskedCpf(cpf: string): string {
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
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

  it('should still return a deactivated customer by external id, unlike the list and getByUserId', async () => {
    // getById is the staff/cross-module lookup (GET /customers/:externalId,
    // RegisterVehicleUseCase/UpdateVehicleUseCase resolving the owning customer). Those callers
    // need to tell "does not exist" (null) apart from "exists but deactivated" (status field) -
    // found and fixed while implementing T20, which needs exactly this distinction to answer 422
    // instead of a misleading 404 for a deactivated owning customer.
    const { customerId } = await registerCustomer(`Jane-${randomUUID()}`, uniqueValidCpf());
    const customer = (await customerRepository.findById(CustomerId.create(customerId)))!;
    customer.deactivate(new Date());
    await customerRepository.save(customer);

    const found = await queryAdapter.getById(customerId);

    expect(found?.status).toBe('INACTIVE');
  });

  // The customers are saved in an order that is neither ascending nor descending by creation date,
  // so only ordering by creation date, newest first, returns them as expected.
  it('should list the customers whose name contains the filter newest first, each with its own user', async () => {
    const marker = randomUUID();
    const now = Date.now();
    const oldest = await registerCustomer(
      `Ana-${marker}`,
      uniqueValidCpf(),
      new Date(now - 120_000),
    );
    const newest = await registerCustomer(`Bia-${marker}`, uniqueValidCpf(), new Date(now));
    const middle = await registerCustomer(
      `Caio-${marker}`,
      uniqueValidCpf(),
      new Date(now - 60_000),
    );
    const deactivated = await registerCustomer(`Dani-${marker}`, uniqueValidCpf());
    await deactivateCustomer(deactivated.customerId);
    await registerCustomer(`Other-${randomUUID()}`, uniqueValidCpf());

    const found = await queryAdapter.listActive({ name: marker.toUpperCase() });

    expect(found).toEqual([summaryOf(newest), summaryOf(middle), summaryOf(oldest)]);
    expect(calls).toEqual(['findUsers', 'toInternalIds']);
  });

  it('should find the customer holding a document typed masked', async () => {
    const document = uniqueValidCpf();
    const registered = await registerCustomer(`Jane-${randomUUID()}`, document);
    await registerCustomer(`Jane-${randomUUID()}`, uniqueValidCpf());

    const found = await queryAdapter.listActive({ document: maskedCpf(document) });

    expect(found).toEqual([summaryOf(registered)]);
  });

  it.each(['123', '11111111111'])(
    'should answer an empty list for the malformed document %s',
    async (document) => {
      await registerCustomer(`Jane-${randomUUID()}`, uniqueValidCpf());

      expect(await queryAdapter.listActive({ document })).toEqual([]);
    },
  );

  it('should list every active customer newest first when no filter is given, reading the users in one batch', async () => {
    const now = Date.now();
    const oldest = await registerCustomer(
      `Ana-${randomUUID()}`,
      uniqueValidCpf(),
      new Date(now - 120_000),
    );
    const newest = await registerCustomer(`Bia-${randomUUID()}`, uniqueValidCpf(), new Date(now));
    const middle = await registerCustomer(
      `Caio-${randomUUID()}`,
      uniqueValidCpf(),
      new Date(now - 60_000),
    );
    const deactivated = await registerCustomer(`Dani-${randomUUID()}`, uniqueValidCpf());
    await deactivateCustomer(deactivated.customerId);
    const registered = [oldest, newest, middle, deactivated];

    const found = await queryAdapter.listActive({});

    const mine = found.filter((customer) =>
      registered.some((candidate) => candidate.customerId === customer.id),
    );
    expect(mine).toEqual([summaryOf(newest), summaryOf(middle), summaryOf(oldest)]);
    expect(calls).toEqual(['toExternalIds', 'findUsers']);
  });

  it('should still list and get a customer whose user account was deactivated', async () => {
    const registered = await registerCustomer(`Jane-${randomUUID()}`, uniqueValidCpf());
    const user = (await userRepository.findById(UserId.create(registered.userId)))!;
    user.deactivate(new Date());
    await userRepository.save(user);

    expect(await queryAdapter.listActive({ document: registered.document })).toEqual([
      summaryOf(registered),
    ]);
    expect(await queryAdapter.getById(registered.customerId)).toEqual(summaryOf(registered));
    expect(await queryAdapter.getByUserId(registered.userId)).toEqual(summaryOf(registered));
  });

  it('should answer null by user id for an unknown user and for a user with no customer record', async () => {
    const withoutCustomer = buildUser({
      email: `${randomUUID()}@example.com`,
      document: uniqueValidCpf(),
    });
    await userRepository.save(withoutCustomer);

    expect(await queryAdapter.getByUserId(randomUUID())).toBeNull();
    expect(await queryAdapter.getByUserId(withoutCustomer.id.value)).toBeNull();
  });
});
