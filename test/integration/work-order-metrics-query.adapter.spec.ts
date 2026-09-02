import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { TypeOrmWorkOrderMetricsQueryAdapter } from '../../src/modules/work-orders/infrastructure/persistence/typeorm-work-order-metrics-query.adapter';
import { createTestDataSource } from '../support/db';

let dataSource: DataSource;
let adapter: TypeOrmWorkOrderMetricsQueryAdapter;

beforeAll(async () => {
  dataSource = createTestDataSource();
  await dataSource.initialize();
  adapter = new TypeOrmWorkOrderMetricsQueryAdapter(dataSource);
});

afterAll(async () => {
  await dataSource.destroy();
});

async function insertUser(): Promise<number> {
  const rows: Array<{ id: number }> = await dataSource.query(
    `INSERT INTO users (external_id, email, password_hash, name, document, status, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, 'hash', 'Test User', $2, 'ACTIVE', now(), now())
     RETURNING id`,
    [
      `wob-metrics-${Math.random().toString(36).slice(2)}@example.com`,
      Math.random().toString().slice(2, 13),
    ],
  );
  return rows[0].id;
}

async function insertCustomer(userId: number): Promise<number> {
  const rows: Array<{ id: number }> = await dataSource.query(
    `INSERT INTO customers (external_id, user_id, status, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, 'ACTIVE', now(), now())
     RETURNING id`,
    [userId],
  );
  return rows[0].id;
}

async function insertVehicle(customerId: number): Promise<number> {
  const rows: Array<{ id: number }> = await dataSource.query(
    `INSERT INTO vehicles (external_id, customer_id, plate, brand, model, year, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, 'Toyota', 'Corolla', 2020, now(), now())
     RETURNING id`,
    [customerId, Math.random().toString(36).slice(2, 9).toUpperCase()],
  );
  return rows[0].id;
}

async function insertService(): Promise<{ internalId: number; externalId: string }> {
  const externalId = randomUUID();
  const rows: Array<{ id: number }> = await dataSource.query(
    `INSERT INTO services (external_id, name, price_cents, estimated_duration_minutes, status, created_at, updated_at)
     VALUES ($1, $2, 15099, 60, 'ACTIVE', now(), now())
     RETURNING id`,
    [externalId, `Servico ${Math.random().toString(36).slice(2)}`],
  );
  return { internalId: rows[0].id, externalId };
}

async function insertWorkOrderService(workOrderId: number, serviceId: number): Promise<void> {
  await dataSource.query(
    `INSERT INTO work_order_services (external_id, work_order_id, service_id, service_name, unit_price_cents, created_at)
     VALUES (gen_random_uuid(), $1, $2, 'Troca de oleo', 15099, now())`,
    [workOrderId, serviceId],
  );
}

interface WorkOrderOverrides {
  status?: string;
  executionStartedAt?: Date | null;
  completedAt?: Date | null;
}

async function insertWorkOrder(
  customerId: number,
  vehicleId: number,
  creatorId: number,
  overrides: WorkOrderOverrides = {},
): Promise<number> {
  const rows: Array<{ id: number }> = await dataSource.query(
    `INSERT INTO work_orders (external_id, number, customer_id, vehicle_id, created_by_user_id, status,
                               customer_name, vehicle_plate, vehicle_brand, vehicle_model, vehicle_year,
                               execution_started_at, completed_at, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'Jane Doe', 'WO01234', 'Toyota', 'Corolla', 2020, $6, $7, now(), now())
     RETURNING id`,
    [
      `${Math.random().toString(36).slice(2, 8).toUpperCase()}-2026`,
      customerId,
      vehicleId,
      creatorId,
      overrides.status ?? 'RECEIVED',
      overrides.executionStartedAt ?? null,
      overrides.completedAt ?? null,
    ],
  );
  return rows[0].id;
}

interface Fixture {
  customerId: number;
  vehicleId: number;
  creatorId: number;
}

async function seedRefs(): Promise<Fixture> {
  const creatorId = await insertUser();
  const customerId = await insertCustomer(creatorId);
  const vehicleId = await insertVehicle(customerId);
  return { customerId, vehicleId, creatorId };
}

/**
 * A random day within a wide range, never a fixed calendar date - the test database is never
 * truncated, so a hardcoded date window would accumulate rows across runs and inflate every
 * count and average a re-run computes (STATE.md Conventions).
 */
// Capped well before the present: the adapter's query is system-wide, not customer-scoped, and
// e2e specs complete real work orders on the real clock. A window that reached into the present
// or future could pick up those unrelated rows and inflate a count this test seeded itself -
// exactly this, observed for real (workOrderCount 4 instead of 2 on the boundary test).
function randomDay(): Date {
  const base = Date.UTC(2000, 0, 1);
  const span = Date.UTC(2020, 0, 1) - base;
  const day = base + Math.floor((Math.random() * span) / 86400000) * 86400000;
  return new Date(day);
}

function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}

describe('TypeOrmWorkOrderMetricsQueryAdapter', () => {
  it('averages COMPLETED and DELIVERED work orders, a DELIVERED one still counting since it completed before delivery', async () => {
    const fixture = await seedRefs();
    const day = randomDay();
    const start = addSeconds(day, 0);
    const completedEnd = addSeconds(day, 3600);
    const deliveredEnd = addSeconds(day, 9600);
    await insertWorkOrder(fixture.customerId, fixture.vehicleId, fixture.creatorId, {
      status: 'COMPLETED',
      executionStartedAt: start,
      completedAt: completedEnd,
    });
    await insertWorkOrder(fixture.customerId, fixture.vehicleId, fixture.creatorId, {
      status: 'DELIVERED',
      executionStartedAt: start,
      completedAt: deliveredEnd,
    });

    const result = await adapter.averageExecutionTime({
      completedFrom: addSeconds(day, -1),
      completedTo: addSeconds(day, 86400),
    });

    // (3600 + 9600) / 2 = 6600
    expect(result.workOrderCount).toBe(2);
    expect(result.averageSeconds).toBe(6600);
  });

  it('excludes work orders still in execution and cancelled work orders', async () => {
    const fixture = await seedRefs();
    const day = randomDay();
    await insertWorkOrder(fixture.customerId, fixture.vehicleId, fixture.creatorId, {
      status: 'IN_EXECUTION',
      executionStartedAt: addSeconds(day, 0),
      completedAt: null,
    });
    await insertWorkOrder(fixture.customerId, fixture.vehicleId, fixture.creatorId, {
      status: 'CANCELED',
      executionStartedAt: addSeconds(day, 0),
      completedAt: addSeconds(day, 3600),
    });

    const result = await adapter.averageExecutionTime({
      completedFrom: addSeconds(day, -1),
      completedTo: addSeconds(day, 86400),
    });

    expect(result.workOrderCount).toBe(0);
    expect(result.averageSeconds).toBe(0);
  });

  it('answers zero with a count of zero when both timestamps are not both set, even on a COMPLETED row', async () => {
    const fixture = await seedRefs();
    const day = randomDay();
    // A COMPLETED row missing execution_started_at should never happen through the API, but the
    // adapter names both columns NOT NULL explicitly rather than trusting the status filter alone
    // to imply them (design.md's fifth risk).
    await insertWorkOrder(fixture.customerId, fixture.vehicleId, fixture.creatorId, {
      status: 'COMPLETED',
      executionStartedAt: null,
      completedAt: addSeconds(day, 3600),
    });

    const result = await adapter.averageExecutionTime({
      completedFrom: addSeconds(day, -1),
      completedTo: addSeconds(day, 86400),
    });

    expect(result.workOrderCount).toBe(0);
    expect(result.averageSeconds).toBe(0);
  });

  it('answers zero with a count of zero when nothing has ever completed', async () => {
    const day = randomDay();

    const result = await adapter.averageExecutionTime({
      completedFrom: addSeconds(day, -1),
      completedTo: addSeconds(day, 86400),
    });

    expect(result.workOrderCount).toBe(0);
    expect(result.averageSeconds).toBe(0);
  });

  it('answers the same zero shape when the date range excludes every completed work order', async () => {
    const fixture = await seedRefs();
    const day = randomDay();
    await insertWorkOrder(fixture.customerId, fixture.vehicleId, fixture.creatorId, {
      status: 'COMPLETED',
      executionStartedAt: addSeconds(day, 0),
      completedAt: addSeconds(day, 3600),
    });

    const result = await adapter.averageExecutionTime({
      completedFrom: addSeconds(day, 30 * 86400),
      completedTo: addSeconds(day, 60 * 86400),
    });

    expect(result.workOrderCount).toBe(0);
    expect(result.averageSeconds).toBe(0);
  });

  it('includes a work order completed exactly on either bound of the date range (L-009 boundary)', async () => {
    const fixture = await seedRefs();
    const day = randomDay();
    const lowerBound = addSeconds(day, 0);
    const upperBound = addSeconds(day, 30 * 86400);
    // Two vehicles: COMPLETED is non-terminal for ux_work_orders_active_vehicle, so a second
    // COMPLETED work order on the same vehicle would collide.
    const secondVehicleId = await insertVehicle(fixture.customerId);
    await insertWorkOrder(fixture.customerId, fixture.vehicleId, fixture.creatorId, {
      status: 'COMPLETED',
      executionStartedAt: addSeconds(lowerBound, -3600),
      completedAt: lowerBound,
    });
    await insertWorkOrder(fixture.customerId, secondVehicleId, fixture.creatorId, {
      status: 'COMPLETED',
      executionStartedAt: addSeconds(upperBound, -3600),
      completedAt: upperBound,
    });

    const result = await adapter.averageExecutionTime({
      completedFrom: lowerBound,
      completedTo: upperBound,
    });

    expect(result.workOrderCount).toBe(2);
  });

  it('averages only the work orders carrying the filtered service, counting a work order once per service it carries', async () => {
    const fixture = await seedRefs();
    const day = randomDay();
    const filtered = await insertService();
    const other = await insertService();
    const secondVehicleId = await insertVehicle(fixture.customerId);
    const withFilteredService = await insertWorkOrder(fixture.customerId, fixture.vehicleId, fixture.creatorId, {
      status: 'COMPLETED',
      executionStartedAt: addSeconds(day, 0),
      completedAt: addSeconds(day, 3600),
    });
    await insertWorkOrderService(withFilteredService, filtered.internalId);
    // Carries the filtered service twice - must still count once, never twice, in the average.
    await insertWorkOrderService(withFilteredService, filtered.internalId);
    const withoutFilteredService = await insertWorkOrder(
      fixture.customerId,
      secondVehicleId,
      fixture.creatorId,
      {
        status: 'COMPLETED',
        executionStartedAt: addSeconds(day, 3 * 86400),
        completedAt: addSeconds(day, 3 * 86400 + 7200),
      },
    );
    await insertWorkOrderService(withoutFilteredService, other.internalId);

    const result = await adapter.averageExecutionTime({
      serviceId: filtered.externalId,
      completedFrom: addSeconds(day, -1),
      completedTo: addSeconds(day, 30 * 86400),
    });

    expect(result.workOrderCount).toBe(1);
    expect(result.averageSeconds).toBe(3600);
  });

  it('returns a whole number of seconds for a fixture whose true average is fractional', async () => {
    const fixture = await seedRefs();
    const day = randomDay();
    // 3600s and 3601s average to 3600.5, which must round rather than truncate or float through.
    const secondVehicleId = await insertVehicle(fixture.customerId);
    await insertWorkOrder(fixture.customerId, fixture.vehicleId, fixture.creatorId, {
      status: 'COMPLETED',
      executionStartedAt: addSeconds(day, 0),
      completedAt: addSeconds(day, 3600),
    });
    await insertWorkOrder(fixture.customerId, secondVehicleId, fixture.creatorId, {
      status: 'COMPLETED',
      executionStartedAt: addSeconds(day, 1 * 86400),
      completedAt: addSeconds(day, 1 * 86400 + 3601),
    });

    const result = await adapter.averageExecutionTime({
      completedFrom: addSeconds(day, -1),
      completedTo: addSeconds(day, 30 * 86400),
    });

    expect(Number.isInteger(result.averageSeconds)).toBe(true);
    expect(result.averageSeconds).toBe(3601);
  });
});
