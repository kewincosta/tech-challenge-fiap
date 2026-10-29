import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { FakeIdGenerator } from '../../../../../../test/support/fakes/fake-id-generator';
import { FakeVehicleOwners } from '../../../../../../test/support/fakes/fake-vehicle-owners';
import { InMemoryVehicleRepository } from '../../../../../../test/support/fakes/in-memory-vehicle.repository';
import { RecordingDomainEventPublisher } from '../../../../../../test/support/fakes/recording-domain-event-publisher';
import { InvalidLicensePlateError } from '../../../domain/errors/invalid-license-plate.error';
import { InvalidVehicleYearError } from '../../../domain/errors/invalid-vehicle-year.error';
import { OwningCustomerInactiveError } from '../../../domain/errors/owning-customer-inactive.error';
import { ReferencedCustomerNotFoundError } from '../../../domain/errors/referenced-customer-not-found.error';
import { VehicleRegistered } from '../../../domain/events/vehicle-registered.event';
import { OwnerRef } from '../../ports/vehicle-owners.port';
import { RegisterVehicleCommand } from './register-vehicle.command';
import { RegisterVehicleHandler } from './register-vehicle.handler';

const CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';
const ACTIVE_OWNER: OwnerRef = { id: CUSTOMER_ID, active: true };

/** `null` leaves the customer out of the fake, so the customers module does not know it. */
function makeHandler(owner: OwnerRef | null = ACTIVE_OWNER) {
  const vehicles = new InMemoryVehicleRepository();
  const owners = new FakeVehicleOwners();
  if (owner) {
    owners.add(owner);
  }
  const clock = new FakeClock();
  const events = new RecordingDomainEventPublisher();
  const handler = new RegisterVehicleHandler(
    vehicles,
    new FakeIdGenerator(),
    clock,
    owners,
    events,
  );
  return { handler, vehicles, clock, events };
}

describe('RegisterVehicleHandler', () => {
  it('should register a vehicle for an active customer', async () => {
    const { handler, vehicles, clock, events } = makeHandler();

    const result = await handler.execute(
      new RegisterVehicleCommand(CUSTOMER_ID, 'ABC1234', 'Toyota', 'Corolla', 2020),
    );

    expect(vehicles.vehicles[0].id.value).toBe(result.id);
    expect(vehicles.vehicles[0].plate.value).toBe('ABC1234');
    expect(vehicles.vehicles[0].customerId).toBe(CUSTOMER_ID);
    expect(events.published).toEqual([new VehicleRegistered(result.id, CUSTOMER_ID, clock.now())]);
  });

  it('should refuse a deactivated customer', async () => {
    const { handler, vehicles } = makeHandler({ ...ACTIVE_OWNER, active: false });

    await expect(
      handler.execute(
        new RegisterVehicleCommand(CUSTOMER_ID, 'ABC1234', 'Toyota', 'Corolla', 2020),
      ),
    ).rejects.toThrow(OwningCustomerInactiveError);
    expect(vehicles.vehicles).toHaveLength(0);
  });

  it('should refuse a customer that does not exist', async () => {
    const { handler, vehicles } = makeHandler(null);

    await expect(
      handler.execute(
        new RegisterVehicleCommand(CUSTOMER_ID, 'ABC1234', 'Toyota', 'Corolla', 2020),
      ),
    ).rejects.toThrow(ReferencedCustomerNotFoundError);
    expect(vehicles.vehicles).toHaveLength(0);
  });

  it('should propagate InvalidLicensePlateError for a malformed plate', async () => {
    const { handler } = makeHandler();

    await expect(
      handler.execute(
        new RegisterVehicleCommand(CUSTOMER_ID, 'INVALID', 'Toyota', 'Corolla', 2020),
      ),
    ).rejects.toThrow(InvalidLicensePlateError);
  });

  it('should propagate InvalidVehicleYearError for an implausible year', async () => {
    const { handler } = makeHandler();

    await expect(
      handler.execute(
        new RegisterVehicleCommand(CUSTOMER_ID, 'ABC1234', 'Toyota', 'Corolla', 1900),
      ),
    ).rejects.toThrow(InvalidVehicleYearError);
  });
});
