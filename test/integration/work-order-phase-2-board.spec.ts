import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { ListWorkOrdersQuery } from '../../src/modules/work-orders/application/queries/list-work-orders/list-work-orders.query';
import { ListWorkOrdersUseCase } from '../../src/modules/work-orders/application/queries/list-work-orders/list-work-orders.use-case';
import { WorkOrder } from '../../src/modules/work-orders/domain/entities/work-order';
import { WorkOrderId } from '../../src/modules/work-orders/domain/value-objects/work-order-id';
import { WorkOrderNumber } from '../../src/modules/work-orders/domain/value-objects/work-order-number';
import { WorkOrderStatus } from '../../src/modules/work-orders/domain/work-order-status';
import { TypeOrmWorkOrderRepository } from '../../src/modules/work-orders/infrastructure/persistence/typeorm-work-order.repository';
import { createTestDataSource } from '../support/db';
import { runMigrations } from '../support/global-setup';
import {
  buildWorkOrderQueryAdapter,
  buildWorkOrderRepository,
} from '../support/work-order-adapters';

// The board's order, its default and its paging are claims about exact lists and exact totals. The
// shared test database is never truncated and keeps every work order any run opened, so the
// spec works on a database of its own, created empty for the run and dropped at the end. The
// suffix keeps the global setup's guard satisfied.
const BOARD_DATABASE = `workshop_board_${randomUUID().replaceAll('-', '').slice(0, 16)}_test`;
const originalDatabase = process.env.DATABASE_NAME;

let dataSource: DataSource;
let repository: TypeOrmWorkOrderRepository;
let listWorkOrders: ListWorkOrdersUseCase;

async function runOnMaintenanceDatabase(statement: string): Promise<void> {
  const maintenance = new DataSource({
    type: 'postgres',
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT),
    username: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: 'postgres',
  });
  await maintenance.initialize();
  try {
    await maintenance.query(statement);
  } finally {
    await maintenance.destroy();
  }
}

beforeAll(async () => {
  await runOnMaintenanceDatabase(`CREATE DATABASE "${BOARD_DATABASE}"`);
  await runMigrations(BOARD_DATABASE);
  process.env.DATABASE_NAME = BOARD_DATABASE;
  dataSource = createTestDataSource();
  await dataSource.initialize();
  repository = buildWorkOrderRepository(dataSource);
  listWorkOrders = new ListWorkOrdersUseCase(buildWorkOrderQueryAdapter(dataSource));
});

afterAll(async () => {
  try {
    await dataSource?.destroy();
  } finally {
    process.env.DATABASE_NAME = originalDatabase;
    await runOnMaintenanceDatabase(`DROP DATABASE IF EXISTS "${BOARD_DATABASE}" WITH (FORCE)`);
  }
});

// Each test starts from an empty board. The database is the spec's own, so nothing else is lost.
beforeEach(async () => {
  await dataSource.query('TRUNCATE work_orders CASCADE');
});

const BASE = Date.UTC(2026, 5, 1, 12, 0, 0);

/** A moment `minutes` after the first one every test counts from. */
function minutesAfterBase(minutes: number): Date {
  return new Date(BASE + minutes * 60_000);
}

interface Saved {
  id: string;
  number: string;
}

async function insertOne(statement: string, values: unknown[]): Promise<number> {
  const rows: Array<{ id: number }> = await dataSource.query(statement, values);
  return rows[0].id;
}

/** Saves a work order in `status`, created at `createdAt`, on a customer and a vehicle of its own,
 * because a vehicle holds at most one open work order. */
async function saveWorkOrder(status: WorkOrderStatus, createdAt: Date): Promise<Saved> {
  const userId = await insertOne(
    `INSERT INTO users (external_id, email, password_hash, name, document, status, created_at, updated_at)
     VALUES ($1, $2, 'hash', 'Test User', $3, 'ACTIVE', now(), now())
     RETURNING id`,
    [
      randomUUID(),
      `board-${Math.random().toString(36).slice(2)}@example.com`,
      Math.random().toString().slice(2, 13),
    ],
  );
  const customerExternalId = randomUUID();
  const customerId = await insertOne(
    `INSERT INTO customers (external_id, user_id, status, created_at, updated_at)
     VALUES ($1, $2, 'ACTIVE', now(), now())
     RETURNING id`,
    [customerExternalId, userId],
  );
  const vehicleExternalId = randomUUID();
  await insertOne(
    `INSERT INTO vehicles (external_id, customer_id, plate, brand, model, year, created_at, updated_at)
     VALUES ($1, $2, $3, 'Toyota', 'Corolla', 2020, now(), now())
     RETURNING id`,
    [vehicleExternalId, customerId, Math.random().toString(36).slice(2, 9).toUpperCase()],
  );
  const creator: Array<{ external_id: string }> = await dataSource.query(
    `SELECT external_id FROM users WHERE id = $1`,
    [userId],
  );
  const id = WorkOrderId.create(randomUUID());
  const number = WorkOrderNumber.create(
    `${Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, '0')}-2026`,
  );
  await repository.save(
    WorkOrder.restore({
      id,
      number,
      customerId: customerExternalId,
      vehicleId: vehicleExternalId,
      assignedMechanicUserId: null,
      createdByUserId: creator[0].external_id,
      status,
      customerName: 'Jane Doe',
      vehiclePlate: 'ABC1234',
      vehicleBrand: 'Toyota',
      vehicleModel: 'Corolla',
      vehicleYear: 2020,
      createdAt,
      updatedAt: createdAt,
      serviceItems: [],
      partItems: [],
      diagnosisStartedAt: null,
      diagnosisCompletedAt: null,
      budgets: [],
      budgetDecidedAt: null,
      budgetDecidedByUserId: null,
      executionStartedAt: null,
    }),
  );
  return { id: id.value, number: number.value };
}

function board(page: number, pageSize: number, statuses: WorkOrderStatus[] = []) {
  return listWorkOrders.execute(new ListWorkOrdersQuery(page, pageSize, statuses));
}

describe('Board listing on its own database', () => {
  it("lists only the open statuses in the brief's order by default", async () => {
    // Created in the order the board must not list them in, so only the status can sort them.
    const received = await saveWorkOrder(WorkOrderStatus.Received, minutesAfterBase(1));
    const canceled = await saveWorkOrder(WorkOrderStatus.Canceled, minutesAfterBase(2));
    const inDiagnosis = await saveWorkOrder(WorkOrderStatus.InDiagnosis, minutesAfterBase(3));
    const delivered = await saveWorkOrder(WorkOrderStatus.Delivered, minutesAfterBase(4));
    const awaiting = await saveWorkOrder(WorkOrderStatus.AwaitingApproval, minutesAfterBase(5));
    const completed = await saveWorkOrder(WorkOrderStatus.Completed, minutesAfterBase(6));
    const inExecution = await saveWorkOrder(WorkOrderStatus.InExecution, minutesAfterBase(7));

    const page = await board(1, 20);

    expect(page.items.map((item) => item.id)).toEqual([
      inExecution.id,
      awaiting.id,
      inDiagnosis.id,
      received.id,
    ]);
    expect(page.items.map((item) => item.status)).toEqual([
      'IN_EXECUTION',
      'AWAITING_APPROVAL',
      'IN_DIAGNOSIS',
      'RECEIVED',
    ]);
    expect(page.totalItems).toBe(4);
    const listed = page.items.map((item) => item.id);
    for (const closed of [completed, delivered, canceled]) {
      expect(listed).not.toContain(closed.id);
    }
  });

  it('lists the older work order first within a status', async () => {
    // The newer one is saved first, so neither the insertion order nor the id order is the answer.
    const newer = await saveWorkOrder(WorkOrderStatus.Received, minutesAfterBase(11));
    const older = await saveWorkOrder(WorkOrderStatus.Received, minutesAfterBase(10));

    const page = await board(1, 20);

    expect(page.items.map((item) => item.id)).toEqual([older.id, newer.id]);
  });

  it('lists delivered before canceled for status=CANCELED,DELIVERED', async () => {
    const canceledFirst = await saveWorkOrder(WorkOrderStatus.Canceled, minutesAfterBase(1));
    const deliveredSecond = await saveWorkOrder(WorkOrderStatus.Delivered, minutesAfterBase(4));
    const canceledSecond = await saveWorkOrder(WorkOrderStatus.Canceled, minutesAfterBase(3));
    const deliveredFirst = await saveWorkOrder(WorkOrderStatus.Delivered, minutesAfterBase(2));
    await saveWorkOrder(WorkOrderStatus.Received, minutesAfterBase(5));
    await saveWorkOrder(WorkOrderStatus.InExecution, minutesAfterBase(6));
    await saveWorkOrder(WorkOrderStatus.Completed, minutesAfterBase(7));

    const page = await board(1, 20, [WorkOrderStatus.Canceled, WorkOrderStatus.Delivered]);

    expect(page.items.map((item) => item.id)).toEqual([
      deliveredFirst.id,
      deliveredSecond.id,
      canceledFirst.id,
      canceledSecond.id,
    ]);
    expect(page.totalItems).toBe(4);
  });

  it('lists only completed work orders for status=COMPLETED', async () => {
    const completedSecond = await saveWorkOrder(WorkOrderStatus.Completed, minutesAfterBase(2));
    const completedFirst = await saveWorkOrder(WorkOrderStatus.Completed, minutesAfterBase(1));
    await saveWorkOrder(WorkOrderStatus.Delivered, minutesAfterBase(3));
    await saveWorkOrder(WorkOrderStatus.Canceled, minutesAfterBase(4));
    await saveWorkOrder(WorkOrderStatus.Received, minutesAfterBase(5));

    const page = await board(1, 20, [WorkOrderStatus.Completed]);

    expect(page.items.map((item) => item.id)).toEqual([completedFirst.id, completedSecond.id]);
    expect(page.items.every((item) => item.status === 'COMPLETED')).toBe(true);
    expect(page.totalItems).toBe(2);
  });

  it('orders all seven statuses when the filter names them all', async () => {
    // Created newest to oldest in the order the board lists them, and named out of order.
    const canceled = await saveWorkOrder(WorkOrderStatus.Canceled, minutesAfterBase(1));
    const delivered = await saveWorkOrder(WorkOrderStatus.Delivered, minutesAfterBase(2));
    const completed = await saveWorkOrder(WorkOrderStatus.Completed, minutesAfterBase(3));
    const received = await saveWorkOrder(WorkOrderStatus.Received, minutesAfterBase(4));
    const inDiagnosis = await saveWorkOrder(WorkOrderStatus.InDiagnosis, minutesAfterBase(5));
    const awaiting = await saveWorkOrder(WorkOrderStatus.AwaitingApproval, minutesAfterBase(6));
    const inExecution = await saveWorkOrder(WorkOrderStatus.InExecution, minutesAfterBase(7));

    const page = await board(1, 20, [
      WorkOrderStatus.Received,
      WorkOrderStatus.Canceled,
      WorkOrderStatus.InDiagnosis,
      WorkOrderStatus.Completed,
      WorkOrderStatus.InExecution,
      WorkOrderStatus.Delivered,
      WorkOrderStatus.AwaitingApproval,
    ]);

    expect(page.items.map((item) => item.id)).toEqual([
      inExecution.id,
      awaiting.id,
      inDiagnosis.id,
      received.id,
      completed.id,
      delivered.id,
      canceled.id,
    ]);
    expect(page.totalItems).toBe(7);
  });

  it('splits five matches into pages of two and answers an empty page past the last', async () => {
    const saved: Saved[] = [];
    for (let minute = 1; minute <= 5; minute += 1) {
      saved.push(await saveWorkOrder(WorkOrderStatus.Received, minutesAfterBase(minute)));
    }
    const statuses = [WorkOrderStatus.Received];

    const first = await board(1, 2, statuses);
    const second = await board(2, 2, statuses);
    const third = await board(3, 2, statuses);
    const fourth = await board(4, 2, statuses);

    expect(first.items.map((item) => item.id)).toEqual([saved[0].id, saved[1].id]);
    expect(second.items.map((item) => item.id)).toEqual([saved[2].id, saved[3].id]);
    expect(third.items.map((item) => item.id)).toEqual([saved[4].id]);
    expect(fourth.items).toEqual([]);
    for (const [index, page] of [first, second, third, fourth].entries()) {
      expect(page).toMatchObject({
        page: index + 1,
        pageSize: 2,
        totalItems: 5,
        totalPages: 3,
      });
    }
  });

  it('answers zero items and zero pages when nothing matches', async () => {
    await saveWorkOrder(WorkOrderStatus.Received, minutesAfterBase(1));
    await saveWorkOrder(WorkOrderStatus.InExecution, minutesAfterBase(2));

    const nothingCompleted = await board(1, 20, [WorkOrderStatus.Completed]);

    expect(nothingCompleted).toEqual({
      items: [],
      page: 1,
      pageSize: 20,
      totalItems: 0,
      totalPages: 0,
    });
    await dataSource.query('TRUNCATE work_orders CASCADE');
    expect(await board(1, 20)).toMatchObject({ items: [], totalItems: 0, totalPages: 0 });
  });
});
