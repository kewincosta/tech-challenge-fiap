import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import {
  PendingStockSteps,
  StockStep,
  StockStepKind,
} from '../../src/modules/work-orders/application/ports/pending-stock-steps.port';
import { PENDING_STOCK_STEPS } from '../../src/modules/work-orders/work-orders.tokens';
import { createTestApp, TestApp } from '../support/app';
import { drainStockSteps, drainStockStepsOfWorkOrder } from '../support/outbox';

// The steps of this spec are due in a window of 2002, long past, so any app that applies the due
// steps takes them, and no step another spec or a real run leaves is in the window.
const DUE_AT = new Date('2002-03-04T00:00:00.000Z');
const WINDOW_START = '2002-03-01';
const WINDOW_END = '2002-04-01';

let testApp: TestApp;
let dataSource: DataSource;
let steps: PendingStockSteps;
let actorId: string;
const made: string[] = [];

beforeAll(async () => {
  testApp = await createTestApp();
  dataSource = testApp.dataSource;
  steps = testApp.app.get<PendingStockSteps>(PENDING_STOCK_STEPS);
  await dataSource.query(`DELETE FROM work_order_stock_steps WHERE due_at >= $1 AND due_at < $2`, [
    WINDOW_START,
    WINDOW_END,
  ]);
  actorId = await insertUser();
});

afterEach(async () => {
  await dataSource.query(
    `DELETE FROM work_order_stock_steps WHERE operation_id = ANY($1::uuid[])`,
    [made.splice(0)],
  );
});

afterAll(async () => {
  await testApp.close();
});

async function insertUser(): Promise<string> {
  const externalId = randomUUID();
  await dataSource.query(
    `INSERT INTO users (external_id, email, password_hash, name, document, status, created_at, updated_at)
     VALUES ($1, $2, 'hash', 'Test User', $3, 'ACTIVE', now(), now())`,
    [externalId, `${externalId}@example.com`, Math.random().toString().slice(2, 13)],
  );
  return externalId;
}

async function insertWorkOrder(): Promise<string> {
  const workOrderExternalId = randomUUID();
  const userRows: Array<{ id: number }> = await dataSource.query(
    `INSERT INTO users (external_id, email, password_hash, name, document, status, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, 'hash', 'Jane Doe', $2, 'ACTIVE', now(), now())
     RETURNING id`,
    [`${randomUUID()}@example.com`, Math.random().toString().slice(2, 13)],
  );
  const customerRows: Array<{ id: number }> = await dataSource.query(
    `INSERT INTO customers (external_id, user_id, status, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, 'ACTIVE', now(), now())
     RETURNING id`,
    [userRows[0].id],
  );
  const vehicleRows: Array<{ id: number }> = await dataSource.query(
    `INSERT INTO vehicles (external_id, customer_id, plate, brand, model, year, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, 'Toyota', 'Corolla', 2020, now(), now())
     RETURNING id`,
    [customerRows[0].id, Math.random().toString(36).slice(2, 9).toUpperCase()],
  );
  await dataSource.query(
    `INSERT INTO work_orders (external_id, number, customer_id, vehicle_id, created_by_user_id, status, customer_name, vehicle_plate, vehicle_brand, vehicle_model, vehicle_year, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'IN_EXECUTION', 'Jane Doe', 'ABC1234', 'Toyota', 'Corolla', 2020, now(), now())`,
    [
      workOrderExternalId,
      `${Math.random().toString(36).slice(2, 8).toUpperCase()}-2026`,
      customerRows[0].id,
      vehicleRows[0].id,
      userRows[0].id,
    ],
  );
  return workOrderExternalId;
}

async function armDueStep(kind: StockStepKind, workOrderId?: string): Promise<StockStep> {
  const step: StockStep = {
    operationId: randomUUID(),
    kind,
    workOrderId: workOrderId ?? (await insertWorkOrder()),
    actorUserId: actorId,
  };
  made.push(step.operationId);
  await steps.arm(step, DUE_AT);
  return step;
}

async function stateOf(operationId: string): Promise<{ status: string; attempts: number }> {
  const rows: Array<{ status: string; attempts: number }> = await dataSource.query(
    `SELECT status, attempts FROM work_order_stock_steps WHERE operation_id = $1`,
    [operationId],
  );
  return rows[0];
}

// Starts an application of its own with settings in the environment, the way a deployment sets
// them, and puts the environment back afterwards: the suites run in one process.
async function withEnvironment(
  values: Record<string, string>,
  body: (started: TestApp) => Promise<void>,
): Promise<void> {
  const originals = Object.fromEntries(
    Object.keys(values).map((name) => [name, process.env[name]]),
  );
  Object.assign(process.env, values);
  let started: TestApp | undefined;
  try {
    started = await createTestApp();
    await body(started);
  } finally {
    await started?.close();
    for (const [name, original] of Object.entries(originals)) {
      if (original === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = original;
      }
    }
  }
}

async function waitUntilDone(operationId: string): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if ((await stateOf(operationId)).status === 'DONE') {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`The step ${operationId} was not applied`);
}

describe('the stock step outbox in the application', () => {
  it('should apply a step that is due when the application starts', async () => {
    const step = await armDueStep(StockStepKind.Settle);

    await withEnvironment({ OUTBOX_POLL_INTERVAL_MS: '600000' }, () =>
      waitUntilDone(step.operationId),
    );

    expect(await stateOf(step.operationId)).toEqual({ status: 'DONE', attempts: 1 });
  });

  it('should apply a step that becomes due after the start, on a later interval', async () => {
    await withEnvironment({ OUTBOX_POLL_INTERVAL_MS: '100' }, async () => {
      const step = await armDueStep(StockStepKind.WriteOff);

      await waitUntilDone(step.operationId);

      expect(await stateOf(step.operationId)).toEqual({ status: 'DONE', attempts: 1 });
    });
  });

  it('should leave a due step alone while the poll interval is 0, at the start and after', async () => {
    const step = await armDueStep(StockStepKind.Settle);
    const started = await createTestApp();
    try {
      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(await stateOf(step.operationId)).toEqual({ status: 'ARMED', attempts: 0 });
    } finally {
      await started.close();
    }
  });

  it.each([StockStepKind.UndoConsumption, StockStepKind.Settle, StockStepKind.WriteOff])(
    'should complete a due %s step through the stock ledger when the test drains its operation',
    async (kind) => {
      const step = await armDueStep(kind);

      await drainStockSteps(testApp.app, [step.operationId]);

      expect(await stateOf(step.operationId)).toEqual({ status: 'DONE', attempts: 1 });
    },
  );

  it('should apply only the operations the test names, leaving another due step untouched', async () => {
    const named = await armDueStep(StockStepKind.Settle);
    const other = await armDueStep(StockStepKind.Settle);

    await drainStockSteps(testApp.app, [named.operationId]);

    expect(await stateOf(named.operationId)).toEqual({ status: 'DONE', attempts: 1 });
    expect(await stateOf(other.operationId)).toEqual({ status: 'ARMED', attempts: 0 });
  });

  it('should drain every step of the named work order, one after the other, and leave the steps of another work order untouched', async () => {
    const workOrderId = await insertWorkOrder();
    const first = await armDueStep(StockStepKind.Settle, workOrderId);
    const second = await armDueStep(StockStepKind.WriteOff, workOrderId);
    const other = await armDueStep(StockStepKind.Settle);

    await drainStockStepsOfWorkOrder(testApp.app, workOrderId);

    expect(await stateOf(first.operationId)).toEqual({ status: 'DONE', attempts: 1 });
    expect(await stateOf(second.operationId)).toEqual({ status: 'DONE', attempts: 1 });
    expect(await stateOf(other.operationId)).toEqual({ status: 'ARMED', attempts: 0 });
  });

  it('should lease a claimed step for the grace period the environment sets', async () => {
    await withEnvironment({ OUTBOX_GRACE_SECONDS: '120' }, async (started) => {
      const step = await armDueStep(StockStepKind.Settle);
      const before = Date.now();

      await drainStockSteps(started.app, [step.operationId]);

      const rows: Array<{ due_at: Date }> = await dataSource.query(
        `SELECT due_at FROM work_order_stock_steps WHERE operation_id = $1`,
        [step.operationId],
      );
      expect(rows[0].due_at.getTime()).toBeGreaterThanOrEqual(before + 120_000);
      expect(rows[0].due_at.getTime()).toBeLessThanOrEqual(Date.now() + 120_000);
    });
  });

  it('should mark a step failed at the attempt limit the environment sets', async () => {
    await withEnvironment({ OUTBOX_MAX_ATTEMPTS: '1' }, async (started) => {
      // Inventory cannot restore units of an item it does not know, so the ledger fails the step.
      const step: StockStep = {
        operationId: randomUUID(),
        kind: StockStepKind.Restore,
        workOrderId: await insertWorkOrder(),
        actorUserId: actorId,
        lines: [{ inventoryItemId: randomUUID(), quantity: 1 }],
      };
      made.push(step.operationId);
      await steps.arm(step, DUE_AT);

      await drainStockSteps(started.app, [step.operationId]);

      const rows: Array<{ status: string; attempts: number; last_error: string | null }> =
        await dataSource.query(
          `SELECT status, attempts, last_error FROM work_order_stock_steps WHERE operation_id = $1`,
          [step.operationId],
        );
      expect(rows[0]).toMatchObject({ status: 'FAILED', attempts: 1 });
      expect(rows[0].last_error).toEqual(expect.any(String));
    });
  });
});
