import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import {
  AccountStep,
  AccountStepKind,
  PendingAccountSteps,
} from '../../src/modules/customers/application/ports/pending-account-steps.port';
import { PENDING_ACCOUNT_STEPS } from '../../src/modules/customers/customers.tokens';
import { createTestApp, TestApp } from '../support/app';
import { drainAccountSteps } from '../support/outbox';

// The steps of this spec are due in a window of 2002, long past, so any app that applies the due
// steps takes them, and no step another spec or a real run leaves is in the window.
const DUE_AT = new Date('2002-03-04T00:00:00.000Z');
const WINDOW_START = '2002-03-01';
const WINDOW_END = '2002-04-01';

let testApp: TestApp;
let dataSource: DataSource;
let steps: PendingAccountSteps;
const made: string[] = [];

beforeAll(async () => {
  testApp = await createTestApp();
  dataSource = testApp.dataSource;
  steps = testApp.app.get<PendingAccountSteps>(PENDING_ACCOUNT_STEPS);
  await dataSource.query(`DELETE FROM customer_account_steps WHERE due_at >= $1 AND due_at < $2`, [
    WINDOW_START,
    WINDOW_END,
  ]);
});

afterEach(async () => {
  await dataSource.query(
    `DELETE FROM customer_account_steps WHERE operation_id = ANY($1::uuid[])`,
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

async function userExists(externalId: string): Promise<boolean> {
  const rows: unknown[] = await dataSource.query(`SELECT 1 FROM users WHERE external_id = $1`, [
    externalId,
  ]);
  return rows.length > 0;
}

async function armDueStep(userId?: string): Promise<AccountStep> {
  const step: AccountStep = {
    operationId: randomUUID(),
    kind: AccountStepKind.DiscardAccount,
    userId: userId ?? (await insertUser()),
  };
  made.push(step.operationId);
  await steps.arm(step, DUE_AT);
  return step;
}

async function stateOf(operationId: string): Promise<{ status: string; attempts: number }> {
  const rows: Array<{ status: string; attempts: number }> = await dataSource.query(
    `SELECT status, attempts FROM customer_account_steps WHERE operation_id = $1`,
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

describe('the account step outbox in the application', () => {
  it('should discard the account of a step that is due when the application starts', async () => {
    const step = await armDueStep();

    await withEnvironment({ OUTBOX_POLL_INTERVAL_MS: '600000' }, () =>
      waitUntilDone(step.operationId),
    );

    expect(await stateOf(step.operationId)).toEqual({ status: 'DONE', attempts: 1 });
    expect(await userExists(step.userId)).toBe(false);
  });

  it('should discard the account of a step that becomes due after the start, on a later interval', async () => {
    await withEnvironment({ OUTBOX_POLL_INTERVAL_MS: '100' }, async () => {
      const step = await armDueStep();

      await waitUntilDone(step.operationId);

      expect(await stateOf(step.operationId)).toEqual({ status: 'DONE', attempts: 1 });
      expect(await userExists(step.userId)).toBe(false);
    });
  });

  it('should leave a due step alone while the poll interval is 0, at the start and after', async () => {
    const step = await armDueStep();
    const started = await createTestApp();
    try {
      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(await stateOf(step.operationId)).toEqual({ status: 'ARMED', attempts: 0 });
      expect(await userExists(step.userId)).toBe(true);
    } finally {
      await started.close();
    }
  });

  it('should discard the account and complete a due step when the test drains its operation', async () => {
    const step = await armDueStep();

    await drainAccountSteps(testApp.app, [step.operationId]);

    expect(await stateOf(step.operationId)).toEqual({ status: 'DONE', attempts: 1 });
    expect(await userExists(step.userId)).toBe(false);
  });

  it('should apply only the operations the test names, leaving another due step untouched', async () => {
    const named = await armDueStep();
    const other = await armDueStep();

    await drainAccountSteps(testApp.app, [named.operationId]);

    expect(await stateOf(named.operationId)).toEqual({ status: 'DONE', attempts: 1 });
    expect(await stateOf(other.operationId)).toEqual({ status: 'ARMED', attempts: 0 });
    expect(await userExists(other.userId)).toBe(true);
  });

  it('should lease a claimed step for the grace period the environment sets', async () => {
    await withEnvironment({ OUTBOX_GRACE_SECONDS: '120' }, async (started) => {
      const step = await armDueStep(randomUUID());
      const before = Date.now();

      await drainAccountSteps(started.app, [step.operationId]);

      const rows: Array<{ due_at: Date }> = await dataSource.query(
        `SELECT due_at FROM customer_account_steps WHERE operation_id = $1`,
        [step.operationId],
      );
      expect(rows[0].due_at.getTime()).toBeGreaterThanOrEqual(before + 120_000);
      expect(rows[0].due_at.getTime()).toBeLessThanOrEqual(Date.now() + 120_000);
    });
  });

  it('should mark a step failed at the attempt limit the environment sets', async () => {
    await withEnvironment({ OUTBOX_MAX_ATTEMPTS: '1' }, async (started) => {
      // A user a customer points at is in use, so identity refuses to discard it and the step fails.
      const userId = await insertUser();
      await dataSource.query(
        `INSERT INTO customers (external_id, user_id, status, created_at, updated_at)
         SELECT gen_random_uuid(), id, 'ACTIVE', now(), now() FROM users WHERE external_id = $1`,
        [userId],
      );
      const step = await armDueStep(userId);

      await drainAccountSteps(started.app, [step.operationId]);

      const rows: Array<{ status: string; attempts: number; last_error: string | null }> =
        await dataSource.query(
          `SELECT status, attempts, last_error FROM customer_account_steps WHERE operation_id = $1`,
          [step.operationId],
        );
      expect(rows[0]).toMatchObject({ status: 'FAILED', attempts: 1 });
      expect(rows[0].last_error).toEqual(expect.any(String));
      expect(await userExists(userId)).toBe(true);
    });
  });
});
