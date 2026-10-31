import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DataSource } from 'typeorm';
import {
  currentEntityManager,
  TypeOrmTransactionRunner,
} from '../../src/shared/infrastructure/database/typeorm-transaction-runner';
import { createTestDataSource } from '../support/db';

let dataSource: DataSource;
let runner: TypeOrmTransactionRunner;

beforeAll(async () => {
  dataSource = createTestDataSource();
  await dataSource.initialize();
  runner = new TypeOrmTransactionRunner(dataSource);
});

afterAll(async () => {
  await dataSource.destroy();
});

// A write the outer transaction makes, to tell a commit from a rollback. The row carries a unique
// email, the way every other row of the never-truncated test database does.
async function insertUserInTransaction(): Promise<string> {
  const email = `${randomUUID()}@example.com`;
  await currentEntityManager()!.query(
    `INSERT INTO users (external_id, email, password_hash, name, document, status, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, 'hash', 'Test User', $2, 'ACTIVE', now(), now())`,
    [email, Math.random().toString().slice(2, 13)],
  );
  return email;
}

async function userExists(email: string): Promise<boolean> {
  const rows: unknown[] = await dataSource.query(`SELECT 1 FROM users WHERE email = $1`, [email]);
  return rows.length > 0;
}

describe('TypeOrmTransactionRunner.run', () => {
  it('rejects a run called while a transaction is open on the same async context, without opening a second one', async () => {
    const transaction = vi.spyOn(dataSource, 'transaction');
    const inner = vi.fn(() => Promise.resolve('inner'));

    await runner.run(async () => {
      await expect(runner.run(inner)).rejects.toThrow(/transaction is already open/);
    });

    expect(inner).not.toHaveBeenCalled();
    expect(transaction).toHaveBeenCalledTimes(1);
    transaction.mockRestore();
  });

  it('refuses with a plain Error that names the runner', async () => {
    await runner.run(async () => {
      const refusal = await runner.run(() => Promise.resolve()).catch((error: unknown) => error);

      expect(refusal).toBeInstanceOf(Error);
      expect((refusal as Error).message).toBe(
        'A transaction is already open on this async context: TypeOrmTransactionRunner.run does not nest.',
      );
    });
  });

  it('lets the outer transaction carry on and commit after the refusal is caught', async () => {
    let email = '';

    await runner.run(async () => {
      await runner.run(() => Promise.resolve()).catch(() => undefined);
      email = await insertUserInTransaction();
    });

    expect(await userExists(email)).toBe(true);
  });

  it('rolls the outer transaction back when the refusal is not caught', async () => {
    let email = '';

    await expect(
      runner.run(async () => {
        email = await insertUserInTransaction();
        await runner.run(() => Promise.resolve());
      }),
    ).rejects.toThrow(/does not nest/);

    expect(await userExists(email)).toBe(false);
  });

  it('opens a transaction for a run called outside any transaction, and again after an earlier run ended', async () => {
    const first = await runner.run(() => Promise.resolve(currentEntityManager() !== undefined));
    const outside = currentEntityManager();
    const second = await runner.run(() => Promise.resolve(currentEntityManager() !== undefined));

    expect([first, outside, second]).toEqual([true, undefined, true]);
  });

  it('refuses a run reached through awaited calls of other code, since the context follows them', async () => {
    const reachesRun = async (): Promise<void> => {
      await Promise.resolve();
      await runner.run(() => Promise.resolve());
    };

    await expect(runner.run(() => reachesRun())).rejects.toThrow(/does not nest/);
  });

  it('does not refuse two runs started at the same time, each on its own async context', async () => {
    const results = await Promise.all([
      runner.run(() => Promise.resolve('first')),
      runner.run(() => Promise.resolve('second')),
    ]);

    expect(results).toEqual(['first', 'second']);
  });
});
