import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { Money } from '../../src/shared/domain/value-objects/money';
import { GetWorkOrderUseCase } from '../../src/modules/work-orders/application/queries/get-work-order/get-work-order.use-case';
import { GetWorkOrderQuery } from '../../src/modules/work-orders/application/queries/get-work-order/get-work-order.query';
import { GetWorkOrderTrailUseCase } from '../../src/modules/work-orders/application/queries/get-work-order-trail/get-work-order-trail.use-case';
import { GetWorkOrderTrailQuery } from '../../src/modules/work-orders/application/queries/get-work-order-trail/get-work-order-trail.query';
import { ListWorkOrdersUseCase } from '../../src/modules/work-orders/application/queries/list-work-orders/list-work-orders.use-case';
import { ListWorkOrdersQuery } from '../../src/modules/work-orders/application/queries/list-work-orders/list-work-orders.query';
import { WorkOrderSummaryDto } from '../../src/modules/work-orders/application/ports/work-order-query.port';
import { WorkOrder } from '../../src/modules/work-orders/domain/entities/work-order';
import { WorkOrderNotFoundError } from '../../src/modules/work-orders/domain/errors/work-order-not-found.error';
import { WorkOrderId } from '../../src/modules/work-orders/domain/value-objects/work-order-id';
import { WorkOrderItemId } from '../../src/modules/work-orders/domain/value-objects/work-order-item-id';
import { WorkOrderNumber } from '../../src/modules/work-orders/domain/value-objects/work-order-number';
import { WorkOrderStatus } from '../../src/modules/work-orders/domain/work-order-status';
import { TypeOrmWorkOrderRepository } from '../../src/modules/work-orders/infrastructure/persistence/typeorm-work-order.repository';
import { createTestDataSource } from '../support/db';
import {
  buildWorkOrderQueryAdapter,
  buildWorkOrderRepository,
} from '../support/work-order-adapters';

let dataSource: DataSource;
let repository: TypeOrmWorkOrderRepository;
let listWorkOrders: ListWorkOrdersUseCase;
let getWorkOrder: GetWorkOrderUseCase;
let getWorkOrderTrail: GetWorkOrderTrailUseCase;

beforeAll(async () => {
  dataSource = createTestDataSource();
  await dataSource.initialize();
  repository = buildWorkOrderRepository(dataSource);
  const queryAdapter = buildWorkOrderQueryAdapter(dataSource);
  listWorkOrders = new ListWorkOrdersUseCase(queryAdapter);
  getWorkOrder = new GetWorkOrderUseCase(queryAdapter);
  getWorkOrderTrail = new GetWorkOrderTrailUseCase(queryAdapter);
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
      `wo-rq-${Math.random().toString(36).slice(2)}@example.com`,
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

function openWorkOrder(fixture: Fixture): WorkOrder {
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

function restoreWorkOrder(fixture: Fixture, status: WorkOrderStatus): WorkOrder {
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

/** The last page the use case lists for `statuses`, at 100 a page. The test database keeps every
 * work order any run opened, so the one a spec just saved is not on the first page; the board
 * lists the oldest first, so the newest work order of a status closes its last page. */
async function listLastPage(statuses: WorkOrderStatus[] = []): Promise<WorkOrderSummaryDto[]> {
  const first = await listWorkOrders.execute(new ListWorkOrdersQuery(1, 100, statuses));
  if (first.totalPages <= 1) {
    return first.items;
  }
  const last = await listWorkOrders.execute(
    new ListWorkOrdersQuery(first.totalPages, 100, statuses),
  );
  return last.items;
}

describe('Work order read queries', () => {
  it('should list the open work orders via ListWorkOrdersQuery when no status is supplied', async () => {
    const fixture = await seedWorkOrderRefs();
    const workOrder = openWorkOrder(fixture);
    await repository.save(workOrder);

    const found = await listLastPage();

    expect(found.some((row) => row.id === workOrder.id.value)).toBe(true);
  });

  it('should filter the list by status when one is supplied', async () => {
    const receivedFixture = await seedWorkOrderRefs();
    const received = openWorkOrder(receivedFixture);
    await repository.save(received);
    const diagnosisFixture = await seedWorkOrderRefs();
    const inDiagnosis = restoreWorkOrder(diagnosisFixture, WorkOrderStatus.InDiagnosis);
    await repository.save(inDiagnosis);

    const found = await listLastPage([WorkOrderStatus.Received]);

    const ids = found.map((row) => row.id);
    expect(ids).toContain(received.id.value);
    expect(ids).not.toContain(inDiagnosis.id.value);
  });

  it('should get one work order by its number via GetWorkOrderQuery', async () => {
    const fixture = await seedWorkOrderRefs();
    const workOrder = openWorkOrder(fixture);
    await repository.save(workOrder);

    const found = await getWorkOrder.execute(new GetWorkOrderQuery(workOrder.number.value));

    expect(found?.id).toBe(workOrder.id.value);
  });

  it('should refuse a well-formed number no work order carries with WorkOrderNotFoundError', async () => {
    await expect(getWorkOrder.execute(new GetWorkOrderQuery('ZZZZZZ-2026'))).rejects.toThrow(
      WorkOrderNotFoundError,
    );
  });

  it('should return the trail in chronological order via GetWorkOrderTrailQuery', async () => {
    const fixture = await seedWorkOrderRefs();
    const service = await insertService();
    const workOrder = openWorkOrder(fixture);
    await repository.save(workOrder);
    const reloaded = await repository.findByNumber(workOrder.number);
    reloaded!.addService({
      itemId: WorkOrderItemId.create(randomUUID()),
      serviceId: service.externalId,
      serviceName: 'Troca de oleo',
      unitPrice: Money.fromCents(15099),
      actorUserId: fixture.creator.externalId,
      now: new Date(Date.now() + 1000),
    });
    await repository.save(reloaded!);

    const trail = await getWorkOrderTrail.execute(
      new GetWorkOrderTrailQuery(workOrder.number.value),
    );

    expect(trail).toHaveLength(2);
    expect(trail[0].eventType).toBe('WORK_ORDER_CREATED');
    expect(trail[1].eventType).toBe('SERVICE_ADDED_TO_WORK_ORDER');
  });
});
