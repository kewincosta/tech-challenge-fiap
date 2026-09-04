import { describe, expect, it } from 'vitest';
import { stubEventBus, stubQueryBus } from '../../../../../../test/support/fakes/bus.stubs';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { FakeIdGenerator } from '../../../../../../test/support/fakes/fake-id-generator';
import { InMemoryVehicleRepository } from '../../../../../../test/support/fakes/in-memory-vehicle.repository';
import { InvalidLicensePlateError } from '../../../domain/errors/invalid-license-plate.error';
import { InvalidVehicleYearError } from '../../../domain/errors/invalid-vehicle-year.error';
import { OwningCustomerInactiveError } from '../../../domain/errors/owning-customer-inactive.error';
import { ReferencedCustomerNotFoundError } from '../../../domain/errors/referenced-customer-not-found.error';
import { RegisterVehicleCommand } from './register-vehicle.command';
import { RegisterVehicleHandler } from './register-vehicle.handler';

const CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';
const ACTIVE_CUSTOMER = {
  id: CUSTOMER_ID,
  userId: '33333333-3333-4333-8333-333333333333',
  name: 'Jane Doe',
  email: 'jane@example.com',
  document: '11144477735',
  address: null,
  phoneNumber: null,
  status: 'ACTIVE',
};

function makeHandler() {
  const vehicles = new InMemoryVehicleRepository();
  const idGenerator = new FakeIdGenerator();
  const clock = new FakeClock();
  const eventBus = stubEventBus();
  const queryBus = stubQueryBus();
  const handler = new RegisterVehicleHandler(
    vehicles,
    idGenerator,
    clock,
    queryBus.bus,
    eventBus.bus,
  );
  return { handler, vehicles, queryBus };
}

describe('RegisterVehicleHandler', () => {
  it('should register a vehicle for an active customer', async () => {
    const { handler, vehicles, queryBus } = makeHandler();
    queryBus.execute.mockResolvedValueOnce(ACTIVE_CUSTOMER);

    const result = await handler.execute(
      new RegisterVehicleCommand(CUSTOMER_ID, 'ABC1234', 'Toyota', 'Corolla', 2020),
    );

    expect(vehicles.vehicles[0].id.value).toBe(result.id);
    expect(vehicles.vehicles[0].plate.value).toBe('ABC1234');
    expect(vehicles.vehicles[0].customerId).toBe(CUSTOMER_ID);
  });

  it('should refuse a deactivated customer', async () => {
    const { handler, queryBus } = makeHandler();
    queryBus.execute.mockResolvedValueOnce({ ...ACTIVE_CUSTOMER, status: 'INACTIVE' });

    await expect(
      handler.execute(
        new RegisterVehicleCommand(CUSTOMER_ID, 'ABC1234', 'Toyota', 'Corolla', 2020),
      ),
    ).rejects.toThrow(OwningCustomerInactiveError);
  });

  it('should refuse a customer that does not exist', async () => {
    const { handler, queryBus } = makeHandler();
    queryBus.execute.mockResolvedValueOnce(null);

    await expect(
      handler.execute(
        new RegisterVehicleCommand(CUSTOMER_ID, 'ABC1234', 'Toyota', 'Corolla', 2020),
      ),
    ).rejects.toThrow(ReferencedCustomerNotFoundError);
  });

  it('should propagate InvalidLicensePlateError for a malformed plate', async () => {
    const { handler, queryBus } = makeHandler();
    queryBus.execute.mockResolvedValueOnce(ACTIVE_CUSTOMER);

    await expect(
      handler.execute(
        new RegisterVehicleCommand(CUSTOMER_ID, 'INVALID', 'Toyota', 'Corolla', 2020),
      ),
    ).rejects.toThrow(InvalidLicensePlateError);
  });

  it('should propagate InvalidVehicleYearError for an implausible year', async () => {
    const { handler, queryBus } = makeHandler();
    queryBus.execute.mockResolvedValueOnce(ACTIVE_CUSTOMER);

    await expect(
      handler.execute(
        new RegisterVehicleCommand(CUSTOMER_ID, 'ABC1234', 'Toyota', 'Corolla', 1900),
      ),
    ).rejects.toThrow(InvalidVehicleYearError);
  });
});
