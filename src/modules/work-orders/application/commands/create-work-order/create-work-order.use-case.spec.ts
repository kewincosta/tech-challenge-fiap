import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { FakeCustomerDirectory } from '../../../../../../test/support/fakes/fake-customer-directory';
import { FakeIdGenerator } from '../../../../../../test/support/fakes/fake-id-generator';
import { FakePartCatalog } from '../../../../../../test/support/fakes/fake-part-catalog';
import { FakeServiceCatalog } from '../../../../../../test/support/fakes/fake-service-catalog';
import { FakeVehicleDirectory } from '../../../../../../test/support/fakes/fake-vehicle-directory';
import { InMemoryWorkOrderRepository } from '../../../../../../test/support/fakes/in-memory-work-order.repository';
import { RecordingDomainEventPublisher } from '../../../../../../test/support/fakes/recording-domain-event-publisher';
import { WorkOrder } from '../../../domain/entities/work-order';
import { CustomerInactiveError } from '../../../domain/errors/customer-inactive.error';
import { InvalidPlannedQuantityError } from '../../../domain/errors/invalid-planned-quantity.error';
import { InventoryItemInactiveError } from '../../../domain/errors/inventory-item-inactive.error';
import { ReferencedCustomerNotFoundError } from '../../../domain/errors/referenced-customer-not-found.error';
import { ReferencedInventoryItemNotFoundError } from '../../../domain/errors/referenced-inventory-item-not-found.error';
import { ReferencedServiceNotFoundError } from '../../../domain/errors/referenced-service-not-found.error';
import { ReferencedVehicleNotFoundError } from '../../../domain/errors/referenced-vehicle-not-found.error';
import { ServiceInactiveError } from '../../../domain/errors/service-inactive.error';
import { VehicleAlreadyHasActiveWorkOrderError } from '../../../domain/errors/vehicle-already-has-active-work-order.error';
import { VehicleNotOwnedByCustomerError } from '../../../domain/errors/vehicle-not-owned-by-customer.error';
import { WorkOrderNumberTakenError } from '../../../domain/errors/work-order-number-taken.error';
import { PartPlannedForWorkOrder } from '../../../domain/events/part-planned-for-work-order.event';
import { ServiceAddedToWorkOrder } from '../../../domain/events/service-added-to-work-order.event';
import { WorkOrderCreated } from '../../../domain/events/work-order-created.event';
import { WorkOrderStatusChanged } from '../../../domain/events/work-order-status-changed.event';
import { WorkOrderTrailEvent } from '../../../domain/events/work-order-trail.event';
import { WorkOrderId } from '../../../domain/value-objects/work-order-id';
import { WorkOrderNumber } from '../../../domain/value-objects/work-order-number';
import { CustomerRef } from '../../ports/customer-directory.port';
import { PartRef } from '../../ports/part-catalog.port';
import { ServiceRef } from '../../ports/service-catalog.port';
import { VehicleRef } from '../../ports/vehicle-directory.port';
import { WorkOrderNumberGenerator } from '../../ports/work-order-number-generator.port';
import { CreateWorkOrderCommand } from './create-work-order.command';
import { CreateWorkOrderUseCase } from './create-work-order.use-case';

const CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';
const VEHICLE_ID = '33333333-3333-4333-8333-333333333333';
const CREATOR_ID = '44444444-4444-4444-8444-444444444444';

const ACTIVE_CUSTOMER: CustomerRef = { id: CUSTOMER_ID, name: 'Jane Doe', active: true };

const OWNED_VEHICLE: VehicleRef = {
  id: VEHICLE_ID,
  customerId: CUSTOMER_ID,
  plate: 'ABC1234',
  brand: 'Toyota',
  model: 'Corolla',
  year: 2020,
};

/** Draws AAAA01-2026, AAAA02-2026 and so on, and remembers every number it handed out. */
class FakeWorkOrderNumberGenerator implements WorkOrderNumberGenerator {
  readonly drawn: string[] = [];

  next(year: number): string {
    const number = `AAAA${String(this.drawn.length + 1).padStart(2, '0')}-${year}`;
    this.drawn.push(number);
    return number;
  }
}

function makeUseCase(
  options: {
    customer?: CustomerRef | null;
    vehicle?: VehicleRef | null;
    services?: ServiceRef[];
    parts?: PartRef[];
  } = {},
): {
  useCase: CreateWorkOrderUseCase;
  workOrders: InMemoryWorkOrderRepository;
  numbers: FakeWorkOrderNumberGenerator;
  events: RecordingDomainEventPublisher;
} {
  const {
    customer = ACTIVE_CUSTOMER,
    vehicle = OWNED_VEHICLE,
    services = [],
    parts = [],
  } = options;
  const customers = new FakeCustomerDirectory();
  if (customer) {
    customers.add(customer);
  }
  const vehicles = new FakeVehicleDirectory();
  if (vehicle) {
    vehicles.add(vehicle);
  }
  const serviceCatalog = new FakeServiceCatalog();
  services.forEach((service) => serviceCatalog.add(service));
  const partCatalog = new FakePartCatalog();
  parts.forEach((part) => partCatalog.add(part));
  const workOrders = new InMemoryWorkOrderRepository();
  const numbers = new FakeWorkOrderNumberGenerator();
  const events = new RecordingDomainEventPublisher();
  const useCase = new CreateWorkOrderUseCase(
    workOrders,
    customers,
    vehicles,
    new FakeIdGenerator(),
    numbers,
    new FakeClock(),
    serviceCatalog,
    partCatalog,
    events,
  );
  return { useCase, workOrders, numbers, events };
}

let heldWorkOrders = 0;

/** A work order of someone else that holds `number`, on a vehicle of its own unless one is given. */
function workOrderHolding(number: string, vehicleId?: string): WorkOrder {
  heldWorkOrders += 1;
  const suffix = String(heldWorkOrders).padStart(12, '0');
  return WorkOrder.open({
    id: WorkOrderId.create(`99999999-9999-4999-8999-${suffix}`),
    number: WorkOrderNumber.create(number),
    customerId: '88888888-8888-4888-8888-888888888888',
    vehicleId: vehicleId ?? `77777777-7777-4777-8777-${suffix}`,
    createdByUserId: CREATOR_ID,
    customerName: 'John Roe',
    vehiclePlate: 'XYZ9876',
    vehicleBrand: 'Honda',
    vehicleModel: 'Civic',
    vehicleYear: 2019,
    now: new Date('2026-08-01T12:00:00.000Z'),
  });
}

describe('CreateWorkOrderUseCase', () => {
  it('should create a RECEIVED work order for an active customer and their vehicle, returning the number and the external id', async () => {
    const { useCase, workOrders } = makeUseCase();

    const result = await useCase.execute(
      new CreateWorkOrderCommand(CUSTOMER_ID, VEHICLE_ID, CREATOR_ID),
    );

    expect(workOrders.workOrders).toHaveLength(1);
    const created = workOrders.workOrders[0];
    expect(result.id).toBe(created.id.value);
    expect(result.number).toBe(created.number.value);
    expect(result.number).toMatch(/^[A-Z0-9]{6}-\d{4}$/);
    expect(created.status).toBe('RECEIVED');
    expect(created.customerId).toBe(CUSTOMER_ID);
    expect(created.vehicleId).toBe(VEHICLE_ID);
    expect(created.createdByUserId).toBe(CREATOR_ID);
  });

  it('should snapshot the customer name and the vehicle plate, brand, model and year onto the work order', async () => {
    const { useCase, workOrders } = makeUseCase();

    await useCase.execute(new CreateWorkOrderCommand(CUSTOMER_ID, VEHICLE_ID, CREATOR_ID));

    const created = workOrders.workOrders[0];
    expect(created.customerName).toBe('Jane Doe');
    expect(created.vehiclePlate).toBe('ABC1234');
    expect(created.vehicleBrand).toBe('Toyota');
    expect(created.vehicleModel).toBe('Corolla');
    expect(created.vehicleYear).toBe(2020);
  });

  it('should publish the creation event of the new work order, with the creator as its actor', async () => {
    const { useCase, workOrders, events } = makeUseCase();

    const result = await useCase.execute(
      new CreateWorkOrderCommand(CUSTOMER_ID, VEHICLE_ID, CREATOR_ID),
    );

    expect(events.published).toHaveLength(2);
    const [event, statusChange] = events.published;
    expect(event).toBeInstanceOf(WorkOrderCreated);
    expect(event).toMatchObject({ workOrderId: result.id, actorUserId: CREATOR_ID });
    expect(statusChange).toBeInstanceOf(WorkOrderStatusChanged);
    expect(statusChange).toMatchObject({
      workOrderId: result.id,
      workOrderNumber: result.number,
      customerId: CUSTOMER_ID,
      vehiclePlate: 'ABC1234',
      fromStatus: null,
      toStatus: 'RECEIVED',
      budgetToDecide: null,
    });
    expect(workOrders.workOrders[0].id.value).toBe(result.id);
  });

  it('should refuse a deactivated customer with CustomerInactiveError and persist and publish nothing', async () => {
    const { useCase, workOrders, events } = makeUseCase({
      customer: { ...ACTIVE_CUSTOMER, active: false },
    });

    await expect(
      useCase.execute(new CreateWorkOrderCommand(CUSTOMER_ID, VEHICLE_ID, CREATOR_ID)),
    ).rejects.toThrow(CustomerInactiveError);
    expect(workOrders.workOrders).toHaveLength(0);
    expect(events.published).toHaveLength(0);
  });

  it('should refuse a vehicle owned by a different customer with VehicleNotOwnedByCustomerError and persist and publish nothing', async () => {
    const { useCase, workOrders, events } = makeUseCase({
      vehicle: { ...OWNED_VEHICLE, customerId: '66666666-6666-4666-8666-666666666666' },
    });

    await expect(
      useCase.execute(new CreateWorkOrderCommand(CUSTOMER_ID, VEHICLE_ID, CREATOR_ID)),
    ).rejects.toThrow(VehicleNotOwnedByCustomerError);
    expect(workOrders.workOrders).toHaveLength(0);
    expect(events.published).toHaveLength(0);
  });

  it('should refuse a customer the directory does not know, with ReferencedCustomerNotFoundError and persist nothing', async () => {
    const { useCase, workOrders } = makeUseCase({ customer: null });

    await expect(
      useCase.execute(new CreateWorkOrderCommand(CUSTOMER_ID, VEHICLE_ID, CREATOR_ID)),
    ).rejects.toThrow(ReferencedCustomerNotFoundError);
    expect(workOrders.workOrders).toHaveLength(0);
  });

  it('should refuse a vehicle the directory does not know, with ReferencedVehicleNotFoundError and persist nothing', async () => {
    const { useCase, workOrders } = makeUseCase({ vehicle: null });

    await expect(
      useCase.execute(new CreateWorkOrderCommand(CUSTOMER_ID, VEHICLE_ID, CREATOR_ID)),
    ).rejects.toThrow(ReferencedVehicleNotFoundError);
    expect(workOrders.workOrders).toHaveLength(0);
  });

  it('should draw a second number when the first collides and succeed', async () => {
    const { useCase, workOrders, events } = makeUseCase();
    await workOrders.save(workOrderHolding('AAAA01-2026'));

    const result = await useCase.execute(
      new CreateWorkOrderCommand(CUSTOMER_ID, VEHICLE_ID, CREATOR_ID),
    );

    expect(result.number).toBe('AAAA02-2026');
    expect(workOrders.workOrders.map((workOrder) => workOrder.number.value)).toEqual([
      'AAAA01-2026',
      'AAAA02-2026',
    ]);
    expect(events.published).toHaveLength(2);
  });

  it('should succeed on the fifth drawn number when the first four are taken', async () => {
    const { useCase, workOrders } = makeUseCase();
    for (const number of ['AAAA01-2026', 'AAAA02-2026', 'AAAA03-2026', 'AAAA04-2026']) {
      await workOrders.save(workOrderHolding(number));
    }

    const result = await useCase.execute(
      new CreateWorkOrderCommand(CUSTOMER_ID, VEHICLE_ID, CREATOR_ID),
    );

    expect(result.number).toBe('AAAA05-2026');
    expect(workOrders.workOrders).toHaveLength(5);
  });

  it('should give up with WorkOrderNumberTakenError when five drawn numbers are all taken, rather than storing a work order without a number', async () => {
    const { useCase, workOrders, events } = makeUseCase();
    for (const number of [
      'AAAA01-2026',
      'AAAA02-2026',
      'AAAA03-2026',
      'AAAA04-2026',
      'AAAA05-2026',
    ]) {
      await workOrders.save(workOrderHolding(number));
    }

    await expect(
      useCase.execute(new CreateWorkOrderCommand(CUSTOMER_ID, VEHICLE_ID, CREATOR_ID)),
    ).rejects.toThrow(WorkOrderNumberTakenError);
    expect(workOrders.workOrders).toHaveLength(5);
    expect(events.published).toHaveLength(0);
  });

  it('should never retry VehicleAlreadyHasActiveWorkOrderError, which propagates on the first attempt', async () => {
    const { useCase, workOrders, numbers, events } = makeUseCase();
    await workOrders.save(workOrderHolding('ZZZZ99-2026', VEHICLE_ID));

    await expect(
      useCase.execute(new CreateWorkOrderCommand(CUSTOMER_ID, VEHICLE_ID, CREATOR_ID)),
    ).rejects.toThrow(VehicleAlreadyHasActiveWorkOrderError);
    expect(numbers.drawn).toEqual(['AAAA01-2026']);
    expect(workOrders.workOrders).toHaveLength(1);
    expect(events.published).toHaveLength(0);
  });
});

const SERVICE_A: ServiceRef = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  name: 'Troca de oleo',
  priceCents: 15099,
  active: true,
};
const SERVICE_B: ServiceRef = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  name: 'Alinhamento',
  priceCents: 12000,
  active: true,
};
const PART_P: PartRef = {
  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  sku: 'PST-001',
  name: 'Pastilha de freio',
  unitPriceCents: 18900,
  active: true,
};

describe('CreateWorkOrderUseCase with services and parts', () => {
  it('should open the work order with one draft item per service and per part, the quantity sent on the part', async () => {
    const { useCase, workOrders } = makeUseCase({
      services: [SERVICE_A, SERVICE_B],
      parts: [PART_P],
    });

    await useCase.execute(
      new CreateWorkOrderCommand(
        CUSTOMER_ID,
        VEHICLE_ID,
        CREATOR_ID,
        [SERVICE_A.id, SERVICE_B.id],
        [{ inventoryItemId: PART_P.id, quantity: 2 }],
      ),
    );

    const created = workOrders.workOrders[0];
    expect(created.status).toBe('RECEIVED');
    expect(created.serviceItems.map((item) => item.serviceId)).toEqual([
      SERVICE_A.id,
      SERVICE_B.id,
    ]);
    expect(created.serviceItems.map((item) => item.unitPrice.cents)).toEqual([15099, 12000]);
    expect(created.serviceItems.every((item) => item.budgetRound === null)).toBe(true);
    expect(created.partItems).toHaveLength(1);
    expect(created.partItems[0].inventoryItemId).toBe(PART_P.id);
    expect(created.partItems[0].sku).toBe('PST-001');
    expect(created.partItems[0].plannedQuantity.units).toBe(2);
    expect(created.partItems[0].withdrawnQuantity).toBe(0);
    expect(created.partItems[0].budgetRound).toBeNull();
  });

  it('should publish the creation event and one item event per service and per part, all by the creator', async () => {
    const { useCase, events } = makeUseCase({
      services: [SERVICE_A, SERVICE_B],
      parts: [PART_P],
    });

    await useCase.execute(
      new CreateWorkOrderCommand(
        CUSTOMER_ID,
        VEHICLE_ID,
        CREATOR_ID,
        [SERVICE_A.id, SERVICE_B.id],
        [{ inventoryItemId: PART_P.id, quantity: 2 }],
      ),
    );

    expect(events.published.map((event) => event.constructor)).toEqual([
      WorkOrderCreated,
      WorkOrderStatusChanged,
      ServiceAddedToWorkOrder,
      ServiceAddedToWorkOrder,
      PartPlannedForWorkOrder,
    ]);
    const trailEvents = events.published.filter(
      (event): event is WorkOrderTrailEvent => event instanceof WorkOrderTrailEvent,
    );
    expect(trailEvents.map((event) => event.actorUserId)).toEqual([
      CREATOR_ID,
      CREATOR_ID,
      CREATOR_ID,
      CREATOR_ID,
    ]);
  });

  it('should refuse a service the catalog does not know, even as the third of three, persisting and publishing nothing', async () => {
    const { useCase, workOrders, events } = makeUseCase({ services: [SERVICE_A, SERVICE_B] });

    await expect(
      useCase.execute(
        new CreateWorkOrderCommand(
          CUSTOMER_ID,
          VEHICLE_ID,
          CREATOR_ID,
          [SERVICE_A.id, SERVICE_B.id, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'],
          [],
        ),
      ),
    ).rejects.toThrow(ReferencedServiceNotFoundError);
    expect(workOrders.workOrders).toHaveLength(0);
    expect(events.published).toHaveLength(0);
  });

  it('should refuse a deactivated service with ServiceInactiveError, persisting and publishing nothing', async () => {
    const { useCase, workOrders, events } = makeUseCase({
      services: [SERVICE_A, { ...SERVICE_B, active: false }],
    });

    await expect(
      useCase.execute(
        new CreateWorkOrderCommand(
          CUSTOMER_ID,
          VEHICLE_ID,
          CREATOR_ID,
          [SERVICE_A.id, SERVICE_B.id],
          [],
        ),
      ),
    ).rejects.toThrow(ServiceInactiveError);
    expect(workOrders.workOrders).toHaveLength(0);
    expect(events.published).toHaveLength(0);
  });

  it('should refuse an inventory item the catalog does not know, persisting and publishing nothing', async () => {
    const { useCase, workOrders, events } = makeUseCase({ services: [SERVICE_A] });

    await expect(
      useCase.execute(
        new CreateWorkOrderCommand(
          CUSTOMER_ID,
          VEHICLE_ID,
          CREATOR_ID,
          [SERVICE_A.id],
          [{ inventoryItemId: PART_P.id, quantity: 1 }],
        ),
      ),
    ).rejects.toThrow(ReferencedInventoryItemNotFoundError);
    expect(workOrders.workOrders).toHaveLength(0);
    expect(events.published).toHaveLength(0);
  });

  it('should refuse a deactivated inventory item with InventoryItemInactiveError, persisting and publishing nothing', async () => {
    const { useCase, workOrders, events } = makeUseCase({
      parts: [{ ...PART_P, active: false }],
    });

    await expect(
      useCase.execute(
        new CreateWorkOrderCommand(
          CUSTOMER_ID,
          VEHICLE_ID,
          CREATOR_ID,
          [],
          [{ inventoryItemId: PART_P.id, quantity: 1 }],
        ),
      ),
    ).rejects.toThrow(InventoryItemInactiveError);
    expect(workOrders.workOrders).toHaveLength(0);
    expect(events.published).toHaveLength(0);
  });

  it('should refuse a quantity below one with InvalidPlannedQuantityError, persisting and publishing nothing', async () => {
    const { useCase, workOrders, events } = makeUseCase({ parts: [PART_P] });

    await expect(
      useCase.execute(
        new CreateWorkOrderCommand(
          CUSTOMER_ID,
          VEHICLE_ID,
          CREATOR_ID,
          [],
          [{ inventoryItemId: PART_P.id, quantity: 0 }],
        ),
      ),
    ).rejects.toThrow(InvalidPlannedQuantityError);
    expect(workOrders.workOrders).toHaveLength(0);
    expect(events.published).toHaveLength(0);
  });

  it('should add the same items to the work order that succeeds after a drawn number collides', async () => {
    const { useCase, workOrders } = makeUseCase({ services: [SERVICE_A], parts: [PART_P] });
    await workOrders.save(workOrderHolding('AAAA01-2026'));

    const result = await useCase.execute(
      new CreateWorkOrderCommand(
        CUSTOMER_ID,
        VEHICLE_ID,
        CREATOR_ID,
        [SERVICE_A.id],
        [{ inventoryItemId: PART_P.id, quantity: 3 }],
      ),
    );

    const created = workOrders.workOrders.find((workOrder) => workOrder.id.value === result.id);
    expect(result.number).toBe('AAAA02-2026');
    expect(created?.serviceItems).toHaveLength(1);
    expect(created?.partItems).toHaveLength(1);
    expect(created?.partItems[0].plannedQuantity.units).toBe(3);
  });
});
