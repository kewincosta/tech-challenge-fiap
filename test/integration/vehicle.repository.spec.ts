import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { Customer } from '../../src/modules/customers/domain/entities/customer';
import { CustomerId } from '../../src/modules/customers/domain/value-objects/customer-id';
import { CustomerOrmEntity } from '../../src/modules/customers/infrastructure/persistence/customer.orm-entity';
import { TypeOrmCustomerRepository } from '../../src/modules/customers/infrastructure/persistence/typeorm-customer.repository';
import { Vehicle } from '../../src/modules/vehicles/domain/entities/vehicle';
import { LicensePlateAlreadyInUseError } from '../../src/modules/vehicles/domain/errors/license-plate-already-in-use.error';
import { LicensePlate } from '../../src/modules/vehicles/domain/value-objects/license-plate';
import { VehicleId } from '../../src/modules/vehicles/domain/value-objects/vehicle-id';
import { VehicleYear } from '../../src/modules/vehicles/domain/value-objects/vehicle-year';
import { TypeOrmVehicleRepository } from '../../src/modules/vehicles/infrastructure/persistence/typeorm-vehicle.repository';
import { VehicleOrmEntity } from '../../src/modules/vehicles/infrastructure/persistence/vehicle.orm-entity';
import { TypeOrmUserRepository } from '../../src/modules/users/infrastructure/persistence/typeorm-user.repository';
import { UserOrmEntity } from '../../src/modules/users/infrastructure/persistence/user.orm-entity';
import { uniqueValidCpf } from '../support/factories/document.factory';
import { uniqueLicensePlate } from '../support/factories/plate.factory';
import { buildUser } from '../support/factories/user.factory';
import { createTestDataSource } from '../support/db';

let dataSource: DataSource;
let vehicleRepository: TypeOrmVehicleRepository;
let customerRepository: TypeOrmCustomerRepository;
let userRepository: TypeOrmUserRepository;

beforeAll(async () => {
  dataSource = createTestDataSource();
  await dataSource.initialize();
  vehicleRepository = new TypeOrmVehicleRepository(
    dataSource.getRepository(VehicleOrmEntity),
    dataSource,
  );
  customerRepository = new TypeOrmCustomerRepository(
    dataSource.getRepository(CustomerOrmEntity),
    dataSource,
  );
  userRepository = new TypeOrmUserRepository(dataSource.getRepository(UserOrmEntity));
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

function newVehicle(customerId: string, plate: string) {
  return Vehicle.register({
    id: VehicleId.create(randomUUID()),
    customerId,
    plate: LicensePlate.create(plate),
    brand: 'Toyota',
    model: 'Corolla',
    year: VehicleYear.create(2020, new Date().getFullYear()),
    now: new Date(),
  });
}

describe('TypeOrmVehicleRepository', () => {
  it('should save a vehicle, resolving the external customerId to the internal customer_id', async () => {
    const customerId = await registerCustomer();
    const vehicle = newVehicle(customerId, uniqueLicensePlate());

    await vehicleRepository.save(vehicle);
    const found = await vehicleRepository.findById(vehicle.id);

    expect(found?.customerId).toBe(customerId);
  });

  it('should round-trip a save-then-find', async () => {
    const customerId = await registerCustomer();
    const plate = uniqueLicensePlate();
    const vehicle = newVehicle(customerId, plate);

    await vehicleRepository.save(vehicle);
    const found = await vehicleRepository.findById(vehicle.id);

    expect(found?.plate.value).toBe(plate);
    expect(found?.brand).toBe('Toyota');
    expect(found?.year.value).toBe(2020);
  });

  it('should throw LicensePlateAlreadyInUseError on a duplicate active plate', async () => {
    const plate = uniqueLicensePlate();
    const first = newVehicle(await registerCustomer(), plate);
    const second = newVehicle(await registerCustomer(), plate);
    await vehicleRepository.save(first);

    await expect(vehicleRepository.save(second)).rejects.toThrow(LicensePlateAlreadyInUseError);
  });

  it('should let a removed vehicle plate be reused by a new registration', async () => {
    const customerId = await registerCustomer();
    const plate = uniqueLicensePlate();
    const removed = newVehicle(customerId, plate);
    await vehicleRepository.save(removed);
    removed.remove(new Date());
    await vehicleRepository.save(removed);

    const reused = newVehicle(customerId, plate);

    await expect(vehicleRepository.save(reused)).resolves.not.toThrow();
  });

  it('should return null for an unknown id', async () => {
    expect(await vehicleRepository.findById(VehicleId.create(randomUUID()))).toBeNull();
  });
});
