import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { Money } from '../../src/shared/domain/value-objects/money';
import { CustomerKeyResolver } from '../../src/modules/customers';
import { UserKeyResolver } from '../../src/modules/identity';
import { InventoryItemKeyResolver } from '../../src/modules/inventory';
import { ServiceKeyResolver } from '../../src/modules/services';
import { VehicleKeyResolver } from '../../src/modules/vehicles';
import { WorkOrder } from '../../src/modules/work-orders/domain/entities/work-order';
import { BudgetId } from '../../src/modules/work-orders/domain/value-objects/budget-id';
import { PlannedQuantity } from '../../src/modules/work-orders/domain/value-objects/planned-quantity';
import { WorkOrderId } from '../../src/modules/work-orders/domain/value-objects/work-order-id';
import { WorkOrderItemId } from '../../src/modules/work-orders/domain/value-objects/work-order-item-id';
import { WorkOrderNumber } from '../../src/modules/work-orders/domain/value-objects/work-order-number';
import { WorkOrderStatus } from '../../src/modules/work-orders/domain/work-order-status';
import { TypeOrmWorkOrderRepository } from '../../src/modules/work-orders/infrastructure/persistence/typeorm-work-order.repository';
import { TypeOrmWorkOrderQueryAdapter } from '../../src/modules/work-orders/infrastructure/persistence/typeorm-work-order-query.adapter';
import { createTestDataSource } from '../support/db';
import { buildWorkOrderRepository } from '../support/work-order-adapters';

// Records which method of which key resolver the adapter calls, so a spec can show that a request
// reads each owner in one batch call.
const calls: string[] = [];

function recorded<T extends object>(owner: string, resolver: T): T {
  return new Proxy(resolver, {
    get(target, property, receiver) {
      const member: unknown = Reflect.get(target, property, receiver);
      if (typeof member !== 'function') {
        return member;
      }
      return (...args: unknown[]): unknown => {
        calls.push(`${owner}.${String(property)}`);
        return (member as (...methodArgs: unknown[]) => unknown).apply(target, args);
      };
    },
  });
}

let dataSource: DataSource;
let repository: TypeOrmWorkOrderRepository;
let queryAdapter: TypeOrmWorkOrderQueryAdapter;

beforeAll(async () => {
  dataSource = createTestDataSource();
  await dataSource.initialize();
  repository = buildWorkOrderRepository(dataSource);
  queryAdapter = new TypeOrmWorkOrderQueryAdapter(
    dataSource,
    recorded('customers', new CustomerKeyResolver(dataSource)),
    recorded('vehicles', new VehicleKeyResolver(dataSource)),
    recorded('users', new UserKeyResolver(dataSource)),
    recorded('services', new ServiceKeyResolver(dataSource)),
    recorded('inventoryItems', new InventoryItemKeyResolver(dataSource)),
  );
});

beforeEach(() => {
  calls.length = 0;
});

afterAll(async () => {
  await dataSource.destroy();
});

interface SeededRef {
  internalId: number;
  externalId: string;
}

async function insertUser(): Promise<SeededRef> {
  const externalId = randomUUID();
  const rows: Array<{ id: number }> = await dataSource.query(
    `INSERT INTO users (external_id, email, password_hash, name, document, status, created_at, updated_at)
     VALUES ($1, $2, 'hash', 'Test User', $3, 'ACTIVE', now(), now())
     RETURNING id`,
    [
      externalId,
      `wo-query-${Math.random().toString(36).slice(2)}@example.com`,
      Math.random().toString().slice(2, 13),
    ],
  );
  return { internalId: rows[0].id, externalId };
}

async function insertCustomer(userInternalId: number): Promise<SeededRef> {
  const externalId = randomUUID();
  const rows: Array<{ id: number }> = await dataSource.query(
    `INSERT INTO customers (external_id, user_id, status, created_at, updated_at)
     VALUES ($1, $2, 'ACTIVE', now(), now())
     RETURNING id`,
    [externalId, userInternalId],
  );
  return { internalId: rows[0].id, externalId };
}

async function insertVehicle(customerInternalId: number): Promise<SeededRef> {
  const externalId = randomUUID();
  const rows: Array<{ id: number }> = await dataSource.query(
    `INSERT INTO vehicles (external_id, customer_id, plate, brand, model, year, created_at, updated_at)
     VALUES ($1, $2, $3, 'Toyota', 'Corolla', 2020, now(), now())
     RETURNING id`,
    [externalId, customerInternalId, Math.random().toString(36).slice(2, 9).toUpperCase()],
  );
  return { internalId: rows[0].id, externalId };
}

async function insertService(): Promise<SeededRef> {
  const externalId = randomUUID();
  const rows: Array<{ id: number }> = await dataSource.query(
    `INSERT INTO services (external_id, name, price_cents, estimated_duration_minutes, status, created_at, updated_at)
     VALUES ($1, $2, 15099, 60, 'ACTIVE', now(), now())
     RETURNING id`,
    [externalId, `Servico ${Math.random().toString(36).slice(2)}`],
  );
  return { internalId: rows[0].id, externalId };
}

async function insertInventoryItem(): Promise<SeededRef> {
  const externalId = randomUUID();
  const rows: Array<{ id: number }> = await dataSource.query(
    `INSERT INTO inventory_items (external_id, sku, name, kind, unit_price_cents, quantity_on_hand, status, created_at, updated_at)
     VALUES ($1, $2, 'Item de teste', 'PART', 1000, 0, 'ACTIVE', now(), now())
     RETURNING id`,
    [externalId, `SKU-${Math.random().toString(36).slice(2)}`],
  );
  return { internalId: rows[0].id, externalId };
}

interface Fixture {
  creator: SeededRef;
  customer: SeededRef;
  vehicle: SeededRef;
}

async function seedWorkOrderRefs(): Promise<Fixture> {
  const creator = await insertUser();
  const customer = await insertCustomer(creator.internalId);
  const vehicle = await insertVehicle(customer.internalId);
  return { creator, customer, vehicle };
}

function uniqueNumber(): WorkOrderNumber {
  return WorkOrderNumber.create(`${Math.random().toString(36).slice(2, 8).toUpperCase()}-2026`);
}

function openWorkOrder(
  fixture: Fixture,
  status: WorkOrderStatus = WorkOrderStatus.Received,
): WorkOrder {
  if (status === WorkOrderStatus.Received) {
    return WorkOrder.open({
      id: WorkOrderId.create(randomUUID()),
      number: uniqueNumber(),
      customerId: fixture.customer.externalId,
      vehicleId: fixture.vehicle.externalId,
      createdByUserId: fixture.creator.externalId,
      customerName: 'Jane Doe',
      vehiclePlate: 'ABC1234',
      vehicleBrand: 'Toyota',
      vehicleModel: 'Corolla',
      vehicleYear: 2020,
      now: new Date(),
    });
  }
  return WorkOrder.restore({
    id: WorkOrderId.create(randomUUID()),
    number: uniqueNumber(),
    customerId: fixture.customer.externalId,
    vehicleId: fixture.vehicle.externalId,
    assignedMechanicUserId: null,
    createdByUserId: fixture.creator.externalId,
    status,
    customerName: 'Jane Doe',
    vehiclePlate: 'ABC1234',
    vehicleBrand: 'Toyota',
    vehicleModel: 'Corolla',
    vehicleYear: 2020,
    createdAt: new Date(),
    updatedAt: new Date(),
    serviceItems: [],
    partItems: [],
    diagnosisStartedAt: null,
    diagnosisCompletedAt: null,
    budgets: [],
    budgetDecidedAt: null,
    budgetDecidedByUserId: null,
    executionStartedAt: null,
  });
}

interface Extras {
  creator: SeededRef;
  mechanic: SeededRef;
  decider: SeededRef;
  services: SeededRef[];
  parts: SeededRef[];
}

/** Takes a received work order through diagnosis to an approved budget, with the given items. */
function withItemsAndDecidedBudget(workOrder: WorkOrder, extras: Extras): WorkOrder {
  const now = new Date();
  workOrder.startDiagnosis({ actorUserId: extras.creator.externalId, now });
  for (const service of extras.services) {
    workOrder.addService({
      itemId: WorkOrderItemId.create(randomUUID()),
      serviceId: service.externalId,
      serviceName: 'Troca de oleo',
      unitPrice: Money.fromCents(15099),
      actorUserId: extras.creator.externalId,
      now,
    });
  }
  for (const part of extras.parts) {
    workOrder.planPart({
      itemId: WorkOrderItemId.create(randomUUID()),
      inventoryItemId: part.externalId,
      sku: 'FLT-001',
      itemName: 'Filtro de oleo',
      unitPrice: Money.fromCents(2500),
      plannedQuantity: PlannedQuantity.create(2),
      actorUserId: extras.creator.externalId,
      now,
    });
  }
  workOrder.assignMechanic({
    mechanicUserId: extras.mechanic.externalId,
    actorUserId: extras.creator.externalId,
    now,
  });
  workOrder.completeDiagnosis({
    budgetId: BudgetId.create(randomUUID()),
    actorUserId: extras.creator.externalId,
    now,
  });
  workOrder.approveBudget({ actorUserId: extras.decider.externalId, now });
  return workOrder;
}

describe('TypeOrmWorkOrderQueryAdapter', () => {
  it('should return a work order by its number with its snapshot, status, assigned mechanic and both item lists', async () => {
    const fixture = await seedWorkOrderRefs();
    const service = await insertService();
    const inventoryItem = await insertInventoryItem();
    const mechanic = await insertUser();
    const workOrder = openWorkOrder(fixture, WorkOrderStatus.InDiagnosis);
    workOrder.addService({
      itemId: WorkOrderItemId.create(randomUUID()),
      serviceId: service.externalId,
      serviceName: 'Troca de oleo',
      unitPrice: Money.fromCents(15099),
      actorUserId: fixture.creator.externalId,
      now: new Date(),
    });
    workOrder.planPart({
      itemId: WorkOrderItemId.create(randomUUID()),
      inventoryItemId: inventoryItem.externalId,
      sku: 'FLT-001',
      itemName: 'Filtro de oleo',
      unitPrice: Money.fromCents(2500),
      plannedQuantity: PlannedQuantity.create(2),
      actorUserId: fixture.creator.externalId,
      now: new Date(),
    });
    workOrder.assignMechanic({
      mechanicUserId: mechanic.externalId,
      actorUserId: fixture.creator.externalId,
      now: new Date(),
    });
    await repository.save(workOrder);

    const found = await queryAdapter.getByNumber(workOrder.number.value);

    expect(found).toMatchObject({
      id: workOrder.id.value,
      number: workOrder.number.value,
      status: 'IN_DIAGNOSIS',
      assignedMechanicUserId: mechanic.externalId,
      customerId: fixture.customer.externalId,
      vehicleId: fixture.vehicle.externalId,
    });
    expect(found?.serviceItems).toHaveLength(1);
    expect(found?.partItems).toHaveLength(1);
  });

  it('should return null from getByNumber for a number no work order carries', async () => {
    expect(await queryAdapter.getByNumber('ZZZZZZ-2026')).toBeNull();
  });

  it('should list every work order when no status is supplied', async () => {
    const fixture = await seedWorkOrderRefs();
    const workOrder = openWorkOrder(fixture);
    await repository.save(workOrder);

    const found = await queryAdapter.listByStatus();

    expect(found.some((row) => row.id === workOrder.id.value)).toBe(true);
  });

  it('should filter the list by status when one is supplied', async () => {
    const receivedFixture = await seedWorkOrderRefs();
    const received = openWorkOrder(receivedFixture, WorkOrderStatus.Received);
    await repository.save(received);
    const diagnosisFixture = await seedWorkOrderRefs();
    const inDiagnosis = openWorkOrder(diagnosisFixture, WorkOrderStatus.InDiagnosis);
    await repository.save(inDiagnosis);

    const found = await queryAdapter.listByStatus('RECEIVED');

    const ids = found.map((row) => row.id);
    expect(ids).toContain(received.id.value);
    expect(ids).not.toContain(inDiagnosis.id.value);
  });

  it("should return the trail in chronological order with the actor's external id", async () => {
    const fixture = await seedWorkOrderRefs();
    const service = await insertService();
    const workOrder = openWorkOrder(fixture);
    await repository.save(workOrder);
    const reloaded1 = await repository.findByNumber(workOrder.number);
    reloaded1!.addService({
      itemId: WorkOrderItemId.create(randomUUID()),
      serviceId: service.externalId,
      serviceName: 'Troca de oleo',
      unitPrice: Money.fromCents(15099),
      actorUserId: fixture.creator.externalId,
      now: new Date(Date.now() + 1000),
    });
    await repository.save(reloaded1!);

    const trail = await queryAdapter.listTrail(workOrder.number.value);

    expect(trail).toHaveLength(2);
    expect(trail[0].eventType).toBe('WORK_ORDER_CREATED');
    expect(trail[1].eventType).toBe('SERVICE_ADDED_TO_WORK_ORDER');
    expect(trail[0].actorUserId).toBe(fixture.creator.externalId);
  });

  it('should return trail events that share one timestamp in the order they were written', async () => {
    const fixture = await seedWorkOrderRefs();
    const workOrder = openWorkOrder(fixture);
    await repository.save(workOrder);
    const [workOrderRow]: Array<{ id: string }> = await dataSource.query(
      `SELECT id FROM work_orders WHERE external_id = $1`,
      [workOrder.id.value],
    );
    // The ids come from the sequence in ascending order and the rows are inserted in the opposite
    // order, so the physical order of the rows differs from their write order.
    const writeOrder: Array<{ id: string; externalId: string }> = [];
    for (let position = 0; position < 3; position += 1) {
      const [nextId]: Array<{ id: string }> = await dataSource.query(
        `SELECT nextval(pg_get_serial_sequence('work_order_events', 'id')) AS id`,
      );
      writeOrder.push({ id: nextId.id, externalId: randomUUID() });
    }
    const sharedInstant = new Date(Date.now() + 60_000);
    for (const event of [...writeOrder].reverse()) {
      await dataSource.query(
        `INSERT INTO work_order_events (id, external_id, work_order_id, event_type, actor_user_id, occurred_at)
         VALUES ($1, $2, $3, 'SERVICE_ADDED_TO_WORK_ORDER', $4, $5)`,
        [event.id, event.externalId, workOrderRow.id, fixture.creator.internalId, sharedInstant],
      );
    }

    const trail = await queryAdapter.listTrail(workOrder.number.value);

    const sharedIds = new Set(writeOrder.map((event) => event.externalId));
    expect(trail.filter((entry) => sharedIds.has(entry.id)).map((entry) => entry.id)).toEqual(
      writeOrder.map((event) => event.externalId),
    );
  });

  it('should return prices as numbers on both getByNumber and listByStatus', async () => {
    const fixture = await seedWorkOrderRefs();
    const service = await insertService();
    const workOrder = openWorkOrder(fixture, WorkOrderStatus.InDiagnosis);
    workOrder.addService({
      itemId: WorkOrderItemId.create(randomUUID()),
      serviceId: service.externalId,
      serviceName: 'Troca de oleo',
      unitPrice: Money.fromCents(15099),
      actorUserId: fixture.creator.externalId,
      now: new Date(),
    });
    await repository.save(workOrder);

    const found = await queryAdapter.getByNumber(workOrder.number.value);
    const listed = await queryAdapter.listByStatus('IN_DIAGNOSIS');
    const listedRow = listed.find((row) => row.id === workOrder.id.value);

    expect(typeof found?.serviceItems[0].unitPriceCents).toBe('number');
    expect(found?.serviceItems[0].unitPriceCents).toBe(15099);
    expect(typeof listedRow?.serviceItems[0].unitPriceCents).toBe('number');
    expect(listedRow?.serviceItems[0].unitPriceCents).toBe(15099);
  });

  it('should return every work order of a customer whatever its status, including cancelled and delivered ones', async () => {
    const fixture = await seedWorkOrderRefs();
    const received = openWorkOrder(fixture, WorkOrderStatus.Received);
    const canceled = openWorkOrder(fixture, WorkOrderStatus.Canceled);
    const delivered = openWorkOrder(fixture, WorkOrderStatus.Delivered);
    await repository.save(received);
    await repository.save(canceled);
    await repository.save(delivered);

    const listed = await queryAdapter.listByCustomerId(fixture.customer.externalId);

    const numbers = listed.map((row) => row.number);
    expect(numbers).toEqual(
      expect.arrayContaining([
        received.number.value,
        canceled.number.value,
        delivered.number.value,
      ]),
    );
  });

  it('should return the same shape listByStatus returns, items and budgets and closing fields included', async () => {
    const fixture = await seedWorkOrderRefs();
    const service = await insertService();
    const workOrder = openWorkOrder(fixture, WorkOrderStatus.InDiagnosis);
    workOrder.addService({
      itemId: WorkOrderItemId.create(randomUUID()),
      serviceId: service.externalId,
      serviceName: 'Troca de oleo',
      unitPrice: Money.fromCents(15099),
      actorUserId: fixture.creator.externalId,
      now: new Date(),
    });
    await repository.save(workOrder);

    const listed = await queryAdapter.listByCustomerId(fixture.customer.externalId);
    const row = listed.find((candidate) => candidate.id === workOrder.id.value);

    expect(row?.serviceItems).toHaveLength(1);
    expect(row?.budgets).toEqual([]);
    expect(row?.chargedTotalCents).toBeNull();
    expect(row?.discountCents).toBe(0);
  });

  it('should return an empty list for a customer with no work order', async () => {
    const fixture = await seedWorkOrderRefs();

    const listed = await queryAdapter.listByCustomerId(fixture.customer.externalId);

    expect(listed).toEqual([]);
  });

  it("should never return a second customer's work orders in the first customer's list", async () => {
    const first = await seedWorkOrderRefs();
    const second = await seedWorkOrderRefs();
    const firstWorkOrder = openWorkOrder(first, WorkOrderStatus.Received);
    const secondWorkOrder = openWorkOrder(second, WorkOrderStatus.Received);
    await repository.save(firstWorkOrder);
    await repository.save(secondWorkOrder);

    const listed = await queryAdapter.listByCustomerId(first.customer.externalId);

    expect(listed.map((row) => row.id)).toEqual([firstWorkOrder.id.value]);
  });

  it('should show no assigned mechanic on a work order that has none', async () => {
    const fixture = await seedWorkOrderRefs();
    const workOrder = openWorkOrder(fixture);
    await repository.save(workOrder);

    const found = await queryAdapter.getByNumber(workOrder.number.value);

    expect(found?.assignedMechanicUserId).toBeNull();
    expect(found?.createdByUserId).toBe(fixture.creator.externalId);
  });

  it('should return an empty list for a customer that does not exist', async () => {
    expect(await queryAdapter.listByCustomerId(randomUUID())).toEqual([]);
  });

  // A request translates the keys of every row it returns in one batch call per owner, however many
  // work orders, items and users the rows hold.
  it('should show every customer, vehicle, user, service and part of a work order as its own, with the items in the order they were added', async () => {
    const fixture = await seedWorkOrderRefs();
    const mechanic = await insertUser();
    const decider = await insertUser();
    const services = [await insertService(), await insertService()];
    const parts = [await insertInventoryItem(), await insertInventoryItem()];
    const workOrder = withItemsAndDecidedBudget(openWorkOrder(fixture), {
      creator: fixture.creator,
      mechanic,
      decider,
      services,
      parts,
    });
    await repository.save(workOrder);

    const found = await queryAdapter.getByNumber(workOrder.number.value);

    expect(found).toMatchObject({
      customerId: fixture.customer.externalId,
      vehicleId: fixture.vehicle.externalId,
      createdByUserId: fixture.creator.externalId,
      assignedMechanicUserId: mechanic.externalId,
    });
    expect(found?.serviceItems.map((item) => item.serviceId)).toEqual(
      services.map((service) => service.externalId),
    );
    expect(found?.partItems.map((item) => item.inventoryItemId)).toEqual(
      parts.map((part) => part.externalId),
    );
    expect(found?.budgets.map((budget) => budget.decidedByUserId)).toEqual([decider.externalId]);
    expect([...calls].sort()).toEqual([
      'customers.toExternalIds',
      'inventoryItems.toExternalIds',
      'services.toExternalIds',
      'users.toExternalIds',
      'vehicles.toExternalIds',
    ]);
  });

  it("should show each work order of a list with its own customer's vehicle, users, services and parts, in one batch call per owner", async () => {
    const first = await seedWorkOrderRefs();
    const second: Fixture = {
      creator: await insertUser(),
      customer: first.customer,
      vehicle: await insertVehicle(first.customer.internalId),
    };
    const firstExtras = {
      creator: first.creator,
      mechanic: await insertUser(),
      decider: await insertUser(),
      services: [await insertService()],
      parts: [await insertInventoryItem()],
    };
    const secondExtras = {
      creator: second.creator,
      mechanic: await insertUser(),
      decider: await insertUser(),
      services: [await insertService(), await insertService()],
      parts: [await insertInventoryItem(), await insertInventoryItem()],
    };
    const firstWorkOrder = withItemsAndDecidedBudget(openWorkOrder(first), firstExtras);
    const secondWorkOrder = withItemsAndDecidedBudget(openWorkOrder(second), secondExtras);
    await repository.save(firstWorkOrder);
    await repository.save(secondWorkOrder);

    const listed = await queryAdapter.listByCustomerId(first.customer.externalId);

    const shown = (workOrder: WorkOrder, fixture: Fixture, extras: typeof firstExtras) => ({
      id: workOrder.id.value,
      customerId: fixture.customer.externalId,
      vehicleId: fixture.vehicle.externalId,
      createdByUserId: fixture.creator.externalId,
      assignedMechanicUserId: extras.mechanic.externalId,
      services: extras.services.map((service) => service.externalId),
      parts: extras.parts.map((part) => part.externalId),
      deciders: [extras.decider.externalId],
    });
    expect(
      listed
        .map((row) => ({
          id: row.id,
          customerId: row.customerId,
          vehicleId: row.vehicleId,
          createdByUserId: row.createdByUserId,
          assignedMechanicUserId: row.assignedMechanicUserId,
          services: row.serviceItems.map((item) => item.serviceId),
          parts: row.partItems.map((item) => item.inventoryItemId),
          deciders: row.budgets.map((budget) => budget.decidedByUserId),
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    ).toEqual(
      [
        shown(firstWorkOrder, first, firstExtras),
        shown(secondWorkOrder, second, secondExtras),
      ].sort((a, b) => a.id.localeCompare(b.id)),
    );
    expect([...calls].sort()).toEqual([
      'customers.toExternalIds',
      'customers.toInternalId',
      'inventoryItems.toExternalIds',
      'services.toExternalIds',
      'users.toExternalIds',
      'vehicles.toExternalIds',
    ]);
  });

  it('should show each trail entry with its own actor, and none for an entry written without one', async () => {
    const fixture = await seedWorkOrderRefs();
    const other = await insertUser();
    const service = await insertService();
    const workOrder = openWorkOrder(fixture);
    await repository.save(workOrder);
    const reloaded = await repository.findByNumber(workOrder.number);
    reloaded!.addService({
      itemId: WorkOrderItemId.create(randomUUID()),
      serviceId: service.externalId,
      serviceName: 'Troca de oleo',
      unitPrice: Money.fromCents(15099),
      actorUserId: other.externalId,
      now: new Date(Date.now() + 1000),
    });
    await repository.save(reloaded!);
    const [workOrderRow]: Array<{ id: string }> = await dataSource.query(
      `SELECT id FROM work_orders WHERE external_id = $1`,
      [workOrder.id.value],
    );
    await dataSource.query(
      `INSERT INTO work_order_events (external_id, work_order_id, event_type, actor_user_id, occurred_at)
       VALUES (gen_random_uuid(), $1, 'SERVICE_ADDED_TO_WORK_ORDER', NULL, $2)`,
      [workOrderRow.id, new Date(Date.now() + 2000)],
    );

    const trail = await queryAdapter.listTrail(workOrder.number.value);

    expect(trail.map((entry) => entry.actorUserId)).toEqual([
      fixture.creator.externalId,
      other.externalId,
      null,
    ]);
    expect(calls).toEqual(['users.toExternalIds']);
  });
});
