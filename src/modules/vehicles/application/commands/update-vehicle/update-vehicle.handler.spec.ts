import { describe, expect, it } from 'vitest';
import { stubEventBus, stubQueryBus } from '../../../../../../test/support/fakes/bus.stubs';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { InMemoryVehicleRepository } from '../../../../../../test/support/fakes/in-memory-vehicle.repository';
import { Vehicle } from '../../../domain/entities/vehicle';
import { OwningCustomerInactiveError } from '../../../domain/errors/owning-customer-inactive.error';
import { ReferencedCustomerNotFoundError } from '../../../domain/errors/referenced-customer-not-found.error';
import { VehicleNotFoundError } from '../../../domain/errors/vehicle-not-found.error';
import { LicensePlate } from '../../../domain/value-objects/license-plate';
import { VehicleId } from '../../../domain/value-objects/vehicle-id';
import { VehicleYear } from '../../../domain/value-objects/vehicle-year';
import { UpdateVehicleCommand } from './update-vehicle.command';
import { UpdateVehicleHandler } from './update-vehicle.handler';

const VEHICLE_ID = VehicleId.create('11111111-1111-4111-8111-111111111111');
const CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_CUSTOMER_ID = '33333333-3333-4333-8333-333333333333';

function makeHandler() {
  const vehicles = new InMemoryVehicleRepository();
  const clock = new FakeClock();
  const eventBus = stubEventBus();
  const queryBus = stubQueryBus();
  const handler = new UpdateVehicleHandler(vehicles, clock, queryBus.bus, eventBus.bus);
  return { handler, vehicles, queryBus };
}

async function seedVehicle(vehicles: InMemoryVehicleRepository) {
  const vehicle = Vehicle.register({
    id: VEHICLE_ID,
    customerId: CUSTOMER_ID,
    plate: LicensePlate.create('ABC1234'),
    brand: 'Toyota',
    model: 'Corolla',
    year: VehicleYear.create(2020, 2026),
    now: new Date(),
  });
  vehicle.pullDomainEvents();
  await vehicles.save(vehicle);
}

describe('UpdateVehicleHandler', () => {
  it('should update brand, model and year', async () => {
    const { handler, vehicles } = makeHandler();
    await seedVehicle(vehicles);

    await handler.execute(new UpdateVehicleCommand(VEHICLE_ID.value, 'Honda', 'Civic', 2021));

    const updated = vehicles.vehicles[0];
    expect(updated.brand).toBe('Honda');
    expect(updated.model).toBe('Civic');
    expect(updated.year.value).toBe(2021);
  });

  it('should transfer ownership to a new active customer', async () => {
    const { handler, vehicles, queryBus } = makeHandler();
    await seedVehicle(vehicles);
    queryBus.execute.mockResolvedValueOnce({ status: 'ACTIVE' });

    await handler.execute(
      new UpdateVehicleCommand(VEHICLE_ID.value, undefined, undefined, undefined, OTHER_CUSTOMER_ID),
    );

    expect(vehicles.vehicles[0].customerId).toBe(OTHER_CUSTOMER_ID);
  });

  it('should refuse transferring to a deactivated customer', async () => {
    const { handler, vehicles, queryBus } = makeHandler();
    await seedVehicle(vehicles);
    queryBus.execute.mockResolvedValueOnce({ status: 'INACTIVE' });

    await expect(
      handler.execute(
        new UpdateVehicleCommand(VEHICLE_ID.value, undefined, undefined, undefined, OTHER_CUSTOMER_ID),
      ),
    ).rejects.toThrow(OwningCustomerInactiveError);
  });

  it('should refuse transferring to a customer that does not exist', async () => {
    const { handler, vehicles, queryBus } = makeHandler();
    await seedVehicle(vehicles);
    queryBus.execute.mockResolvedValueOnce(null);

    await expect(
      handler.execute(
        new UpdateVehicleCommand(VEHICLE_ID.value, undefined, undefined, undefined, OTHER_CUSTOMER_ID),
      ),
    ).rejects.toThrow(ReferencedCustomerNotFoundError);
  });

  it('should refuse when the vehicle does not exist', async () => {
    const { handler } = makeHandler();

    await expect(
      handler.execute(new UpdateVehicleCommand('00000000-0000-4000-8000-000000000001')),
    ).rejects.toThrow(VehicleNotFoundError);
  });
});
