import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { FakeVehicleOwners } from '../../../../../../test/support/fakes/fake-vehicle-owners';
import { InMemoryVehicleRepository } from '../../../../../../test/support/fakes/in-memory-vehicle.repository';
import { RecordingDomainEventPublisher } from '../../../../../../test/support/fakes/recording-domain-event-publisher';
import { Vehicle } from '../../../domain/entities/vehicle';
import { OwningCustomerInactiveError } from '../../../domain/errors/owning-customer-inactive.error';
import { ReferencedCustomerNotFoundError } from '../../../domain/errors/referenced-customer-not-found.error';
import { VehicleNotFoundError } from '../../../domain/errors/vehicle-not-found.error';
import { VehicleUpdated } from '../../../domain/events/vehicle-updated.event';
import { LicensePlate } from '../../../domain/value-objects/license-plate';
import { VehicleId } from '../../../domain/value-objects/vehicle-id';
import { VehicleYear } from '../../../domain/value-objects/vehicle-year';
import { OwnerRef } from '../../ports/vehicle-owners.port';
import { UpdateVehicleCommand } from './update-vehicle.command';
import { UpdateVehicleUseCase } from './update-vehicle.use-case';

const VEHICLE_ID = VehicleId.create('11111111-1111-4111-8111-111111111111');
const CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_CUSTOMER_ID = '33333333-3333-4333-8333-333333333333';

/** `newOwner` seeds the customer the vehicle is transferred to; leaving it out, the customers module knows none. */
function makeUseCase(newOwner?: OwnerRef) {
  const vehicles = new InMemoryVehicleRepository();
  const owners = new FakeVehicleOwners();
  if (newOwner) {
    owners.add(newOwner);
  }
  const clock = new FakeClock();
  const events = new RecordingDomainEventPublisher();
  const useCase = new UpdateVehicleUseCase(vehicles, clock, owners, events);
  return { useCase, vehicles, clock, events };
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

describe('UpdateVehicleUseCase', () => {
  it('should update brand, model and year', async () => {
    const { useCase, vehicles, clock, events } = makeUseCase();
    await seedVehicle(vehicles);

    await useCase.execute(new UpdateVehicleCommand(VEHICLE_ID.value, 'Honda', 'Civic', 2021));

    const updated = vehicles.vehicles[0];
    expect(updated.brand).toBe('Honda');
    expect(updated.model).toBe('Civic');
    expect(updated.year.value).toBe(2021);
    expect(events.published).toEqual([new VehicleUpdated(VEHICLE_ID.value, clock.now())]);
  });

  it('should transfer ownership to a new active customer', async () => {
    const { useCase, vehicles } = makeUseCase({ id: OTHER_CUSTOMER_ID, active: true });
    await seedVehicle(vehicles);

    await useCase.execute(
      new UpdateVehicleCommand(
        VEHICLE_ID.value,
        undefined,
        undefined,
        undefined,
        OTHER_CUSTOMER_ID,
      ),
    );

    expect(vehicles.vehicles[0].customerId).toBe(OTHER_CUSTOMER_ID);
  });

  it('should refuse transferring to a deactivated customer', async () => {
    const { useCase, vehicles } = makeUseCase({ id: OTHER_CUSTOMER_ID, active: false });
    await seedVehicle(vehicles);

    await expect(
      useCase.execute(
        new UpdateVehicleCommand(
          VEHICLE_ID.value,
          undefined,
          undefined,
          undefined,
          OTHER_CUSTOMER_ID,
        ),
      ),
    ).rejects.toThrow(OwningCustomerInactiveError);
    expect(vehicles.vehicles[0].customerId).toBe(CUSTOMER_ID);
  });

  it('should refuse transferring to a customer that does not exist', async () => {
    const { useCase, vehicles } = makeUseCase();
    await seedVehicle(vehicles);

    await expect(
      useCase.execute(
        new UpdateVehicleCommand(
          VEHICLE_ID.value,
          undefined,
          undefined,
          undefined,
          OTHER_CUSTOMER_ID,
        ),
      ),
    ).rejects.toThrow(ReferencedCustomerNotFoundError);
    expect(vehicles.vehicles[0].customerId).toBe(CUSTOMER_ID);
  });

  it('should refuse when the vehicle does not exist', async () => {
    const { useCase } = makeUseCase();

    await expect(
      useCase.execute(new UpdateVehicleCommand('00000000-0000-4000-8000-000000000001')),
    ).rejects.toThrow(VehicleNotFoundError);
  });
});
