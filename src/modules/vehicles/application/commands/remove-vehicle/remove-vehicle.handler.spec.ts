import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { InMemoryVehicleRepository } from '../../../../../../test/support/fakes/in-memory-vehicle.repository';
import { RecordingDomainEventPublisher } from '../../../../../../test/support/fakes/recording-domain-event-publisher';
import { Vehicle } from '../../../domain/entities/vehicle';
import { VehicleNotFoundError } from '../../../domain/errors/vehicle-not-found.error';
import { VehicleRemoved } from '../../../domain/events/vehicle-removed.event';
import { LicensePlate } from '../../../domain/value-objects/license-plate';
import { VehicleId } from '../../../domain/value-objects/vehicle-id';
import { VehicleYear } from '../../../domain/value-objects/vehicle-year';
import { RemoveVehicleCommand } from './remove-vehicle.command';
import { RemoveVehicleHandler } from './remove-vehicle.handler';

const VEHICLE_ID = VehicleId.create('11111111-1111-4111-8111-111111111111');
const CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';

function makeHandler() {
  const vehicles = new InMemoryVehicleRepository();
  const clock = new FakeClock();
  const events = new RecordingDomainEventPublisher();
  const handler = new RemoveVehicleHandler(vehicles, clock, events);
  return { handler, vehicles, clock, events };
}

describe('RemoveVehicleHandler', () => {
  it('should set the soft-delete marker', async () => {
    const { handler, vehicles, clock, events } = makeHandler();
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

    await handler.execute(new RemoveVehicleCommand(VEHICLE_ID.value));

    expect(vehicles.vehicles[0].deletedAt).not.toBeNull();
    expect(events.published).toEqual([new VehicleRemoved(VEHICLE_ID.value, clock.now())]);
  });

  it('should be idempotent when removed twice', async () => {
    const { handler, vehicles, clock, events } = makeHandler();
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
    await handler.execute(new RemoveVehicleCommand(VEHICLE_ID.value));

    await expect(
      handler.execute(new RemoveVehicleCommand(VEHICLE_ID.value)),
    ).resolves.not.toThrow();
    expect(events.published).toEqual([new VehicleRemoved(VEHICLE_ID.value, clock.now())]);
  });

  it('should refuse when the vehicle does not exist', async () => {
    const { handler } = makeHandler();

    await expect(
      handler.execute(new RemoveVehicleCommand('00000000-0000-4000-8000-000000000001')),
    ).rejects.toThrow(VehicleNotFoundError);
  });
});
