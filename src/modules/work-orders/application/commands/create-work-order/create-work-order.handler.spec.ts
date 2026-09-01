import { describe, expect, it, vi } from 'vitest';
import { stubEventBus, stubQueryBus } from '../../../../../../test/support/fakes/bus.stubs';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { FakeIdGenerator } from '../../../../../../test/support/fakes/fake-id-generator';
import { InMemoryWorkOrderRepository } from '../../../../../../test/support/fakes/in-memory-work-order.repository';
import { CustomerSummaryDto } from '../../../../customers/application/ports/customer-query.port';
import { GetCustomerQuery } from '../../../../customers/application/queries/get-customer/get-customer.query';
import { VehicleSummaryDto } from '../../../../vehicles/application/ports/vehicle-query.port';
import { GetVehicleQuery } from '../../../../vehicles/application/queries/get-vehicle/get-vehicle.query';
import { WorkOrder } from '../../../domain/entities/work-order';
import { CustomerInactiveError } from '../../../domain/errors/customer-inactive.error';
import { ReferencedCustomerNotFoundError } from '../../../domain/errors/referenced-customer-not-found.error';
import { ReferencedVehicleNotFoundError } from '../../../domain/errors/referenced-vehicle-not-found.error';
import { VehicleAlreadyHasActiveWorkOrderError } from '../../../domain/errors/vehicle-already-has-active-work-order.error';
import { VehicleNotOwnedByCustomerError } from '../../../domain/errors/vehicle-not-owned-by-customer.error';
import { WorkOrderNumberTakenError } from '../../../domain/errors/work-order-number-taken.error';
import { WorkOrderRepository } from '../../../domain/repositories/work-order.repository';
import { WorkOrderNumberGenerator } from '../../ports/work-order-number-generator.port';
import { CreateWorkOrderCommand } from './create-work-order.command';
import { CreateWorkOrderHandler } from './create-work-order.handler';

const CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';
const VEHICLE_ID = '33333333-3333-4333-8333-333333333333';
const CREATOR_ID = '44444444-4444-4444-8444-444444444444';

const ACTIVE_CUSTOMER: CustomerSummaryDto = {
  id: CUSTOMER_ID,
  userId: '55555555-5555-4555-8555-555555555555',
  name: 'Jane Doe',
  email: 'jane@example.com',
  document: '11144477735',
  address: null,
  phoneNumber: null,
  status: 'ACTIVE',
};

const OWNED_VEHICLE: VehicleSummaryDto = {
  id: VEHICLE_ID,
  customerId: CUSTOMER_ID,
  plate: 'ABC1234',
  brand: 'Toyota',
  model: 'Corolla',
  year: 2020,
};

/** A fake sequencing distinct numbers - branching by class, per design.md's Risks & Concerns:
 * never assume the handler reads the customer before the vehicle or vice versa. */
function stubQueries(
  customer: CustomerSummaryDto | null,
  vehicle: VehicleSummaryDto | null,
): ReturnType<typeof stubQueryBus> {
  const queryBus = stubQueryBus();
  queryBus.execute.mockImplementation((query: unknown) => {
    if (query instanceof GetCustomerQuery) {
      return Promise.resolve(customer);
    }
    if (query instanceof GetVehicleQuery) {
      return Promise.resolve(vehicle);
    }
    return Promise.resolve(null);
  });
  return queryBus;
}

class FakeWorkOrderNumberGenerator implements WorkOrderNumberGenerator {
  private counter = 0;

  next(year: number): string {
    this.counter += 1;
    return `AAAA${String(this.counter).padStart(2, '0')}-${year}`;
  }
}

function makeHandler(customer: CustomerSummaryDto | null, vehicle: VehicleSummaryDto | null) {
  const workOrders = new InMemoryWorkOrderRepository();
  const queryBus = stubQueries(customer, vehicle);
  const eventBus = stubEventBus();
  const handler = new CreateWorkOrderHandler(
    workOrders,
    new FakeIdGenerator(),
    new FakeWorkOrderNumberGenerator(),
    new FakeClock(),
    queryBus.bus,
    eventBus.bus,
  );
  return { handler, workOrders, queryBus, eventBus };
}

describe('CreateWorkOrderHandler', () => {
  it('should create a RECEIVED work order for an active customer and their vehicle, returning the number and the external id', async () => {
    const { handler, workOrders } = makeHandler(ACTIVE_CUSTOMER, OWNED_VEHICLE);

    const result = await handler.execute(
      new CreateWorkOrderCommand(CUSTOMER_ID, VEHICLE_ID, CREATOR_ID),
    );

    expect(workOrders.workOrders).toHaveLength(1);
    expect(result.id).toBe(workOrders.workOrders[0].id.value);
    expect(result.number).toMatch(/^[A-Z0-9]{6}-\d{4}$/);
    expect(workOrders.workOrders[0].status).toBe('RECEIVED');
  });

  it('should snapshot the customer name and the vehicle plate, brand, model and year onto the work order', async () => {
    const { handler, workOrders } = makeHandler(ACTIVE_CUSTOMER, OWNED_VEHICLE);

    await handler.execute(new CreateWorkOrderCommand(CUSTOMER_ID, VEHICLE_ID, CREATOR_ID));

    const created = workOrders.workOrders[0];
    expect(created.customerName).toBe('Jane Doe');
    expect(created.vehiclePlate).toBe('ABC1234');
    expect(created.vehicleBrand).toBe('Toyota');
    expect(created.vehicleModel).toBe('Corolla');
    expect(created.vehicleYear).toBe(2020);
  });

  it('should refuse a deactivated customer with CustomerInactiveError and persist nothing', async () => {
    const { handler, workOrders } = makeHandler(
      { ...ACTIVE_CUSTOMER, status: 'INACTIVE' },
      OWNED_VEHICLE,
    );

    await expect(
      handler.execute(new CreateWorkOrderCommand(CUSTOMER_ID, VEHICLE_ID, CREATOR_ID)),
    ).rejects.toThrow(CustomerInactiveError);
    expect(workOrders.workOrders).toHaveLength(0);
  });

  it('should refuse a vehicle owned by a different customer with VehicleNotOwnedByCustomerError and persist nothing', async () => {
    const { handler, workOrders } = makeHandler(ACTIVE_CUSTOMER, {
      ...OWNED_VEHICLE,
      customerId: '66666666-6666-4666-8666-666666666666',
    });

    await expect(
      handler.execute(new CreateWorkOrderCommand(CUSTOMER_ID, VEHICLE_ID, CREATOR_ID)),
    ).rejects.toThrow(VehicleNotOwnedByCustomerError);
    expect(workOrders.workOrders).toHaveLength(0);
  });

  it('should refuse a customer the query answers null for, with ReferencedCustomerNotFoundError and persist nothing', async () => {
    const { handler, workOrders } = makeHandler(null, OWNED_VEHICLE);

    await expect(
      handler.execute(new CreateWorkOrderCommand(CUSTOMER_ID, VEHICLE_ID, CREATOR_ID)),
    ).rejects.toThrow(ReferencedCustomerNotFoundError);
    expect(workOrders.workOrders).toHaveLength(0);
  });

  it('should refuse a vehicle the query answers null for, with ReferencedVehicleNotFoundError and persist nothing', async () => {
    const { handler, workOrders } = makeHandler(ACTIVE_CUSTOMER, null);

    await expect(
      handler.execute(new CreateWorkOrderCommand(CUSTOMER_ID, VEHICLE_ID, CREATOR_ID)),
    ).rejects.toThrow(ReferencedVehicleNotFoundError);
    expect(workOrders.workOrders).toHaveLength(0);
  });

  it('should draw a second number when the first collides and succeed', async () => {
    const queryBus = stubQueries(ACTIVE_CUSTOMER, OWNED_VEHICLE);
    const eventBus = stubEventBus();
    const save = vi
      .fn<(workOrder: WorkOrder) => Promise<void>>()
      .mockRejectedValueOnce(new WorkOrderNumberTakenError())
      .mockResolvedValueOnce(undefined);
    const workOrders: WorkOrderRepository = { findByNumber: () => Promise.resolve(null), save };
    const handler = new CreateWorkOrderHandler(
      workOrders,
      new FakeIdGenerator(),
      new FakeWorkOrderNumberGenerator(),
      new FakeClock(),
      queryBus.bus,
      eventBus.bus,
    );

    const result = await handler.execute(
      new CreateWorkOrderCommand(CUSTOMER_ID, VEHICLE_ID, CREATOR_ID),
    );

    expect(save).toHaveBeenCalledTimes(2);
    expect(result.id).toEqual(expect.any(String));
  });

  it('should give up after five collisions rather than storing a work order without a number', async () => {
    const queryBus = stubQueries(ACTIVE_CUSTOMER, OWNED_VEHICLE);
    const eventBus = stubEventBus();
    const save = vi
      .fn<(workOrder: WorkOrder) => Promise<void>>()
      .mockRejectedValue(new WorkOrderNumberTakenError());
    const workOrders: WorkOrderRepository = { findByNumber: () => Promise.resolve(null), save };
    const handler = new CreateWorkOrderHandler(
      workOrders,
      new FakeIdGenerator(),
      new FakeWorkOrderNumberGenerator(),
      new FakeClock(),
      queryBus.bus,
      eventBus.bus,
    );

    await expect(
      handler.execute(new CreateWorkOrderCommand(CUSTOMER_ID, VEHICLE_ID, CREATOR_ID)),
    ).rejects.toThrow(WorkOrderNumberTakenError);
    expect(save).toHaveBeenCalledTimes(5);
  });

  it('should never retry VehicleAlreadyHasActiveWorkOrderError, which propagates on the first attempt', async () => {
    const queryBus = stubQueries(ACTIVE_CUSTOMER, OWNED_VEHICLE);
    const eventBus = stubEventBus();
    const save = vi
      .fn<(workOrder: WorkOrder) => Promise<void>>()
      .mockRejectedValueOnce(new VehicleAlreadyHasActiveWorkOrderError());
    const workOrders: WorkOrderRepository = { findByNumber: () => Promise.resolve(null), save };
    const handler = new CreateWorkOrderHandler(
      workOrders,
      new FakeIdGenerator(),
      new FakeWorkOrderNumberGenerator(),
      new FakeClock(),
      queryBus.bus,
      eventBus.bus,
    );

    await expect(
      handler.execute(new CreateWorkOrderCommand(CUSTOMER_ID, VEHICLE_ID, CREATOR_ID)),
    ).rejects.toThrow(VehicleAlreadyHasActiveWorkOrderError);
    expect(save).toHaveBeenCalledTimes(1);
  });
});
