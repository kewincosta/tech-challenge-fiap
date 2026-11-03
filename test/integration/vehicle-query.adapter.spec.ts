import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { Customer } from '../../src/modules/customers/domain/entities/customer';
import { CustomerId } from '../../src/modules/customers/domain/value-objects/customer-id';
import { CustomerOrmEntity } from '../../src/modules/customers/infrastructure/persistence/customer.orm-entity';
import { TypeOrmCustomerRepository } from '../../src/modules/customers/infrastructure/persistence/typeorm-customer.repository';
import { CustomerKeyResolver } from '../../src/modules/customers';
import { Vehicle } from '../../src/modules/vehicles/domain/entities/vehicle';
import { LicensePlate } from '../../src/modules/vehicles/domain/value-objects/license-plate';
import { VehicleId } from '../../src/modules/vehicles/domain/value-objects/vehicle-id';
import { VehicleYear } from '../../src/modules/vehicles/domain/value-objects/vehicle-year';
import { TypeOrmVehicleQueryAdapter } from '../../src/modules/vehicles/infrastructure/persistence/typeorm-vehicle-query.adapter';
import { TypeOrmVehicleRepository } from '../../src/modules/vehicles/infrastructure/persistence/typeorm-vehicle.repository';
import { VehicleOrmEntity } from '../../src/modules/vehicles/infrastructure/persistence/vehicle.orm-entity';
import { UserKeyResolver } from '../../src/modules/identity';
import { TypeOrmUserRepository } from '../../src/modules/identity/users/infrastructure/persistence/typeorm-user.repository';
import { UserOrmEntity } from '../../src/modules/identity/users/infrastructure/persistence/user.orm-entity';
import { uniqueValidCpf } from '../support/factories/document.factory';
import { uniqueLicensePlate } from '../support/factories/plate.factory';
import { buildUser } from '../support/factories/user.factory';
import { createTestDataSource } from '../support/db';

// Records what the adapter asks the customers key resolver for, in order, so a spec can show that a
// list reads its owners in one batch call.
const calls: string[] = [];

class RecordingCustomerKeyResolver extends CustomerKeyResolver {
  override toInternalId(externalId: string): Promise<string | null> {
    calls.push('toInternalId');
    return super.toInternalId(externalId);
  }

  override toExternalIds(internalIds: string[]): Promise<Map<string, string>> {
    calls.push('toExternalIds');
    return super.toExternalIds(internalIds);
  }
}

let dataSource: DataSource;
let queryAdapter: TypeOrmVehicleQueryAdapter;
let vehicleRepository: TypeOrmVehicleRepository;
let customerRepository: TypeOrmCustomerRepository;
let userRepository: TypeOrmUserRepository;

beforeAll(async () => {
  dataSource = createTestDataSource();
  await dataSource.initialize();
  queryAdapter = new TypeOrmVehicleQueryAdapter(
    dataSource,
    new RecordingCustomerKeyResolver(dataSource),
  );
  vehicleRepository = new TypeOrmVehicleRepository(
    dataSource.getRepository(VehicleOrmEntity),
    new CustomerKeyResolver(dataSource),
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

async function registerCustomer(): Promise<string> {
  const user = buildUser({ email: `${randomUUID()}@example.com`, document: uniqueValidCpf() });
  await userRepository.save(user);
  const customer = Customer.register({
    id: CustomerId.create(randomUUID()),
    userId: user.id.value,
    now: new Date(),
  });
  await customerRepository.save(customer);
  return customer.id.value;
}

async function registerVehicle(customerId: string): Promise<Vehicle> {
  const vehicle = Vehicle.register({
    id: VehicleId.create(randomUUID()),
    customerId,
    plate: LicensePlate.create(uniqueLicensePlate()),
    brand: 'Toyota',
    model: 'Corolla',
    year: VehicleYear.create(2020, new Date().getFullYear()),
    now: new Date(),
  });
  await vehicleRepository.save(vehicle);
  return vehicle;
}

describe('TypeOrmVehicleQueryAdapter', () => {
  it('should get a vehicle by its external id with the owning customer external id', async () => {
    const customerId = await registerCustomer();
    const vehicle = await registerVehicle(customerId);

    const found = await queryAdapter.getById(vehicle.id.value);

    expect(found?.customerId).toBe(customerId);
    expect(found?.plate).toBe(vehicle.plate.value);
  });

  it('should return null for an unknown vehicle id', async () => {
    expect(await queryAdapter.getById(randomUUID())).toBeNull();
  });

  it('should list every active vehicle of one customer', async () => {
    const customerId = await registerCustomer();
    const first = await registerVehicle(customerId);
    const second = await registerVehicle(customerId);

    const found = await queryAdapter.listByCustomerId(customerId);

    expect(found.map((v) => v.id).sort()).toEqual([first.id.value, second.id.value].sort());
  });

  it('should exclude a removed vehicle from the list', async () => {
    const customerId = await registerCustomer();
    const vehicle = await registerVehicle(customerId);
    vehicle.remove(new Date());
    await vehicleRepository.save(vehicle);

    const found = await queryAdapter.listByCustomerId(customerId);

    expect(found.find((v) => v.id === vehicle.id.value)).toBeUndefined();
  });

  it('should list no vehicle for a customer that does not exist', async () => {
    expect(await queryAdapter.listByCustomerId(randomUUID())).toEqual([]);
  });

  it('should show the owner of every vehicle in a list, reading the owner in one batch', async () => {
    const customerId = await registerCustomer();
    await registerCustomer();
    const vehicles = [
      await registerVehicle(customerId),
      await registerVehicle(customerId),
      await registerVehicle(customerId),
    ];

    const found = await queryAdapter.listByCustomerId(customerId);

    expect(found.map((v) => [v.id, v.customerId]).sort()).toEqual(
      vehicles.map((v) => [v.id.value, customerId]).sort(),
    );
    expect(calls).toEqual(['toInternalId', 'toExternalIds']);
  });
});
