import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { Money } from '../../src/shared/domain/value-objects/money';
import { WorkOrder } from '../../src/modules/work-orders/domain/entities/work-order';
import { PlannedQuantity } from '../../src/modules/work-orders/domain/value-objects/planned-quantity';
import { WorkOrderId } from '../../src/modules/work-orders/domain/value-objects/work-order-id';
import { WorkOrderItemId } from '../../src/modules/work-orders/domain/value-objects/work-order-item-id';
import { WorkOrderNumber } from '../../src/modules/work-orders/domain/value-objects/work-order-number';
import { WorkOrderStatus } from '../../src/modules/work-orders/domain/work-order-status';
import { WorkOrderOrmEntity } from '../../src/modules/work-orders/infrastructure/persistence/work-order.orm-entity';
import { WorkOrderServiceOrmEntity } from '../../src/modules/work-orders/infrastructure/persistence/work-order-service.orm-entity';
import { WorkOrderPartOrmEntity } from '../../src/modules/work-orders/infrastructure/persistence/work-order-part.orm-entity';
import { TypeOrmWorkOrderRepository } from '../../src/modules/work-orders/infrastructure/persistence/typeorm-work-order.repository';
import { createTestDataSource } from '../support/db';

let dataSource: DataSource;
let repository: TypeOrmWorkOrderRepository;

beforeAll(async () => {
  dataSource = createTestDataSource();
  await dataSource.initialize();
  repository = new TypeOrmWorkOrderRepository(
    dataSource.getRepository(WorkOrderOrmEntity),
    dataSource.getRepository(WorkOrderServiceOrmEntity),
    dataSource.getRepository(WorkOrderPartOrmEntity),
    dataSource,
  );
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
      `wo-repo-${Math.random().toString(36).slice(2)}@example.com`,
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

function openWorkOrder(fixture: Fixture): WorkOrder {
  return WorkOrder.open({
    id: WorkOrderId.create(randomUUID()),
    number: WorkOrderNumber.create(`${Math.random().toString(36).slice(2, 8).toUpperCase()}-2026`),
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

/** `planPart` needs `IN_DIAGNOSIS` or `IN_EXECUTION` - `open` only ever starts `RECEIVED`. */
function restoreWorkOrderInDiagnosis(fixture: Fixture): WorkOrder {
  return WorkOrder.restore({
    id: WorkOrderId.create(randomUUID()),
    number: WorkOrderNumber.create(`${Math.random().toString(36).slice(2, 8).toUpperCase()}-2026`),
    customerId: fixture.customer.externalId,
    vehicleId: fixture.vehicle.externalId,
    assignedMechanicUserId: null,
    createdByUserId: fixture.creator.externalId,
    status: WorkOrderStatus.InDiagnosis,
    customerName: 'Jane Doe',
    vehiclePlate: 'ABC1234',
    vehicleBrand: 'Toyota',
    vehicleModel: 'Corolla',
    vehicleYear: 2020,
    createdAt: new Date(),
    updatedAt: new Date(),
    serviceItems: [],
    partItems: [],
  });
}

describe('TypeOrmWorkOrderRepository', () => {
  it('should round-trip a save-then-find with both item lists intact', async () => {
    const fixture = await seedWorkOrderRefs();
    const service = await insertService();
    const inventoryItem = await insertInventoryItem();
    const workOrder = restoreWorkOrderInDiagnosis(fixture);
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

    await repository.save(workOrder);
    const found = await repository.findByNumber(workOrder.number);

    expect(found?.number.value).toBe(workOrder.number.value);
    expect(found?.customerId).toBe(fixture.customer.externalId);
    expect(found?.vehicleId).toBe(fixture.vehicle.externalId);
    expect(found?.createdByUserId).toBe(fixture.creator.externalId);
    expect(found?.serviceItems).toHaveLength(1);
    expect(found?.serviceItems[0].serviceId).toBe(service.externalId);
    expect(found?.partItems).toHaveLength(1);
    expect(found?.partItems[0].inventoryItemId).toBe(inventoryItem.externalId);
    expect(found?.partItems[0].plannedQuantity.units).toBe(2);
  });

  it('should attach no trail entries from findByNumber, however many the work order has', async () => {
    const fixture = await seedWorkOrderRefs();
    const workOrder = openWorkOrder(fixture);
    await repository.save(workOrder);
    const savedRow: Array<{ id: number }> = await dataSource.query(
      `SELECT id FROM work_orders WHERE external_id = $1`,
      [workOrder.id.value],
    );
    // A trail row inserted directly, bypassing T10's own writer, to prove findByNumber ignores
    // work_order_events entirely rather than happening to find none.
    await dataSource.query(
      `INSERT INTO work_order_events (external_id, work_order_id, event_type, to_status, occurred_at)
       VALUES (gen_random_uuid(), $1, 'WORK_ORDER_CREATED', 'RECEIVED', now())`,
      [savedRow[0].id],
    );

    const found = await repository.findByNumber(workOrder.number);

    expect(found?.pullDomainEvents()).toHaveLength(0);
  });

  it('should return null for a number no work order carries', async () => {
    const found = await repository.findByNumber(WorkOrderNumber.create('ZZZZZZ-2026'));
    expect(found).toBeNull();
  });

  it('should resolve the customer, vehicle and creator external ids to internal keys at the repository boundary', async () => {
    const fixture = await seedWorkOrderRefs();
    const workOrder = openWorkOrder(fixture);

    await repository.save(workOrder);

    const rows: Array<{ customer_id: number; vehicle_id: number; created_by_user_id: number }> =
      await dataSource.query(
        `SELECT customer_id, vehicle_id, created_by_user_id FROM work_orders WHERE external_id = $1`,
        [workOrder.id.value],
      );
    expect(rows[0].customer_id).toBe(fixture.customer.internalId);
    expect(rows[0].vehicle_id).toBe(fixture.vehicle.internalId);
    expect(rows[0].created_by_user_id).toBe(fixture.creator.internalId);
  });

  it('should reload unit prices as numbers on both item tables even though the driver returns bigint as a string', async () => {
    const fixture = await seedWorkOrderRefs();
    const service = await insertService();
    const inventoryItem = await insertInventoryItem();
    const workOrder = restoreWorkOrderInDiagnosis(fixture);
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

    await repository.save(workOrder);

    const serviceRaw: Array<{ unit_price_cents: string }> = await dataSource.query(
      `SELECT unit_price_cents FROM work_order_services WHERE external_id = $1`,
      [workOrder.serviceItems[0].id.value],
    );
    const partRaw: Array<{ unit_price_cents: string }> = await dataSource.query(
      `SELECT unit_price_cents FROM work_order_parts WHERE external_id = $1`,
      [workOrder.partItems[0].id.value],
    );
    const found = await repository.findByNumber(workOrder.number);

    expect(typeof serviceRaw[0].unit_price_cents).toBe('string');
    expect(typeof partRaw[0].unit_price_cents).toBe('string');
    expect(found?.serviceItems[0].unitPrice.cents).toBe(15099);
    expect(typeof found?.serviceItems[0].unitPrice.cents).toBe('number');
    expect(found?.partItems[0].unitPrice.cents).toBe(2500);
    expect(typeof found?.partItems[0].unitPrice.cents).toBe('number');
  });

  it('should delete only the removed item on the next save, leaving the others', async () => {
    const fixture = await seedWorkOrderRefs();
    const service = await insertService();
    const workOrder = openWorkOrder(fixture);
    const keptItemId = WorkOrderItemId.create(randomUUID());
    workOrder.addService({
      itemId: keptItemId,
      serviceId: service.externalId,
      serviceName: 'Alinhamento',
      unitPrice: Money.fromCents(8000),
      actorUserId: fixture.creator.externalId,
      now: new Date(),
    });
    const removedItemId = WorkOrderItemId.create(randomUUID());
    workOrder.addService({
      itemId: removedItemId,
      serviceId: service.externalId,
      serviceName: 'Troca de oleo',
      unitPrice: Money.fromCents(15099),
      actorUserId: fixture.creator.externalId,
      now: new Date(),
    });
    await repository.save(workOrder);

    workOrder.removeItem({
      itemId: removedItemId,
      actorUserId: fixture.creator.externalId,
      now: new Date(),
    });
    await repository.save(workOrder);

    const rows: Array<{ external_id: string }> = await dataSource.query(
      `SELECT wos.external_id FROM work_order_services wos
         JOIN work_orders wo ON wo.id = wos.work_order_id
        WHERE wo.external_id = $1`,
      [workOrder.id.value],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].external_id).toBe(keptItemId.value);
  });
});
