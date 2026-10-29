import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { Customer } from '../../src/modules/customers/domain/entities/customer';
import { CustomerId } from '../../src/modules/customers/domain/value-objects/customer-id';
import { CustomerOrmEntity } from '../../src/modules/customers/infrastructure/persistence/customer.orm-entity';
import { TypeOrmCustomerQueryAdapter } from '../../src/modules/customers/infrastructure/persistence/typeorm-customer-query.adapter';
import { TypeOrmCustomerRepository } from '../../src/modules/customers/infrastructure/persistence/typeorm-customer.repository';
import { CustomerKeyResolver } from '../../src/modules/customers';
import { Vehicle } from '../../src/modules/vehicles/domain/entities/vehicle';
import { VehicleNotFoundError } from '../../src/modules/vehicles/domain/errors/vehicle-not-found.error';
import { LicensePlate } from '../../src/modules/vehicles/domain/value-objects/license-plate';
import { VehicleId } from '../../src/modules/vehicles/domain/value-objects/vehicle-id';
import { VehicleYear } from '../../src/modules/vehicles/domain/value-objects/vehicle-year';
import { GetCustomerByUserIdUseCase } from '../../src/modules/customers/application/queries/get-customer-by-user-id/get-customer-by-user-id.use-case';
import { GetCustomerUseCase } from '../../src/modules/customers/application/queries/get-customer/get-customer.use-case';
import { GetMyVehiclesHandler } from '../../src/modules/vehicles/application/queries/get-my-vehicles/get-my-vehicles.handler';
import { GetMyVehiclesQuery } from '../../src/modules/vehicles/application/queries/get-my-vehicles/get-my-vehicles.query';
import { GetVehicleHandler } from '../../src/modules/vehicles/application/queries/get-vehicle/get-vehicle.handler';
import { GetVehicleQuery } from '../../src/modules/vehicles/application/queries/get-vehicle/get-vehicle.query';
import { ListVehiclesByCustomerHandler } from '../../src/modules/vehicles/application/queries/list-vehicles-by-customer/list-vehicles-by-customer.handler';
import { ListVehiclesByCustomerQuery } from '../../src/modules/vehicles/application/queries/list-vehicles-by-customer/list-vehicles-by-customer.query';
import { VehicleOwnersGateway } from '../../src/modules/vehicles/infrastructure/gateways/vehicle-owners.gateway';
import { TypeOrmVehicleQueryAdapter } from '../../src/modules/vehicles/infrastructure/persistence/typeorm-vehicle-query.adapter';
import { TypeOrmVehicleRepository } from '../../src/modules/vehicles/infrastructure/persistence/typeorm-vehicle.repository';
import { VehicleOrmEntity } from '../../src/modules/vehicles/infrastructure/persistence/vehicle.orm-entity';
import { FindUsersUseCase, UserKeyResolver } from '../../src/modules/identity';
import { TypeOrmUserQueryAdapter } from '../../src/modules/identity/users/infrastructure/persistence/typeorm-user-query.adapter';
import { TypeOrmUserRepository } from '../../src/modules/identity/users/infrastructure/persistence/typeorm-user.repository';
import { UserOrmEntity } from '../../src/modules/identity/users/infrastructure/persistence/user.orm-entity';
import { uniqueValidCpf } from '../support/factories/document.factory';
import { uniqueLicensePlate } from '../support/factories/plate.factory';
import { buildUser } from '../support/factories/user.factory';
import { createTestDataSource } from '../support/db';

let dataSource: DataSource;
let getVehicleHandler: GetVehicleHandler;
let listVehiclesByCustomerHandler: ListVehiclesByCustomerHandler;
let getMyVehiclesHandler: GetMyVehiclesHandler;
let vehicleRepository: TypeOrmVehicleRepository;
let customerRepository: TypeOrmCustomerRepository;
let userRepository: TypeOrmUserRepository;

beforeAll(async () => {
  dataSource = createTestDataSource();
  await dataSource.initialize();
  const vehicleQueryAdapter = new TypeOrmVehicleQueryAdapter(
    dataSource,
    new CustomerKeyResolver(dataSource),
  );
  const customerQueryAdapter = new TypeOrmCustomerQueryAdapter(
    dataSource,
    new FindUsersUseCase(
      new TypeOrmUserQueryAdapter(dataSource.getRepository(UserOrmEntity), dataSource),
    ),
    new UserKeyResolver(dataSource),
  );
  getVehicleHandler = new GetVehicleHandler(vehicleQueryAdapter);
  listVehiclesByCustomerHandler = new ListVehiclesByCustomerHandler(vehicleQueryAdapter);

  // GetMyVehiclesHandler reaches the customers module through the real gateway and the real
  // customers handlers over the test database, proving the cross-module contract, not a stub
  // standing in for it.
  const vehicleOwners = new VehicleOwnersGateway(
    new GetCustomerUseCase(customerQueryAdapter),
    new GetCustomerByUserIdUseCase(customerQueryAdapter),
  );
  getMyVehiclesHandler = new GetMyVehiclesHandler(vehicleQueryAdapter, vehicleOwners);

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

afterAll(async () => {
  await dataSource.destroy();
});

async function registerCustomer(): Promise<{ customerId: string; userId: string }> {
  const user = buildUser({ email: `${randomUUID()}@example.com`, document: uniqueValidCpf() });
  await userRepository.save(user);
  const customer = Customer.register({
    id: CustomerId.create(randomUUID()),
    userId: user.id.value,
    now: new Date(),
  });
  await customerRepository.save(customer);
  return { customerId: customer.id.value, userId: user.id.value };
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

describe('Vehicle read queries', () => {
  it('should get a vehicle by its external id', async () => {
    const { customerId } = await registerCustomer();
    const vehicle = await registerVehicle(customerId);

    const found = await getVehicleHandler.execute(new GetVehicleQuery(vehicle.id.value));

    expect(found?.id).toBe(vehicle.id.value);
  });

  it('should refuse a vehicle id that does not exist with the vehicle not-found error', async () => {
    await expect(getVehicleHandler.execute(new GetVehicleQuery(randomUUID()))).rejects.toThrow(
      VehicleNotFoundError,
    );
  });

  it('should list every vehicle of one customer', async () => {
    const { customerId } = await registerCustomer();
    const vehicle = await registerVehicle(customerId);

    const found = await listVehiclesByCustomerHandler.execute(
      new ListVehiclesByCustomerQuery(customerId),
    );

    expect(found.map((v) => v.id)).toContain(vehicle.id.value);
  });

  it("should resolve the principal's customer and list their vehicles", async () => {
    const { customerId, userId } = await registerCustomer();
    const vehicle = await registerVehicle(customerId);

    const found = await getMyVehiclesHandler.execute(new GetMyVehiclesQuery(userId));

    expect(found.map((v) => v.id)).toEqual([vehicle.id.value]);
  });

  it('should return an empty list when the principal has no customer record', async () => {
    const found = await getMyVehiclesHandler.execute(new GetMyVehiclesQuery(randomUUID()));

    expect(found).toEqual([]);
  });
});
