import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { ConcurrentModificationError } from '../../src/shared/application/errors/concurrent-modification.error';
import { Clock } from '../../src/shared/application/ports/clock.port';
import { IdGenerator } from '../../src/shared/application/ports/id-generator.port';
import { TransactionRunner } from '../../src/shared/application/ports/transaction-runner.port';
import { CLOCK, TRANSACTION_RUNNER } from '../../src/shared/shared.tokens';
import { RegisterCustomerCommand } from '../../src/modules/customers/application/commands/register-customer/register-customer.command';
import { RegisterCustomerUseCase } from '../../src/modules/customers/application/commands/register-customer/register-customer.use-case';
import { OutboxSettings } from '../../src/modules/customers/application/outbox-settings';
import { CustomerAccounts } from '../../src/modules/customers/application/ports/customer-accounts.port';
import { CustomerRepository } from '../../src/modules/customers/application/ports/customer.repository';
import {
  AccountStepKind,
  PendingAccountSteps,
} from '../../src/modules/customers/application/ports/pending-account-steps.port';
import { Customer } from '../../src/modules/customers/domain/entities/customer';
import {
  CUSTOMER_ACCOUNTS,
  CUSTOMER_REPOSITORY,
  OUTBOX_SETTINGS,
  PENDING_ACCOUNT_STEPS,
} from '../../src/modules/customers/customers.tokens';
import { EmailAlreadyInUseError } from '../../src/modules/identity/users/domain/errors/email-already-in-use.error';
import { uniqueValidCpf } from '../support/factories/document.factory';
import { createTestApp, TestApp } from '../support/app';
import { drainAccountSteps } from '../support/outbox';

// The registration on the real adapters: the outbox, the accounts gateway into identity, the
// transaction runner and a database. Only the customer repository is wrapped, so a save can fail on
// demand, and the account port is wrapped to run a hook between its calls.
let testApp: TestApp;
let dataSource: DataSource;
let steps: PendingAccountSteps;
let accounts: CustomerAccounts;
let customers: CustomerRepository;
let transactionRunner: TransactionRunner;
let clock: Clock;
let settings: OutboxSettings;
const madeUsers: string[] = [];

beforeAll(async () => {
  testApp = await createTestApp();
  dataSource = testApp.dataSource;
  steps = testApp.app.get<PendingAccountSteps>(PENDING_ACCOUNT_STEPS);
  accounts = testApp.app.get<CustomerAccounts>(CUSTOMER_ACCOUNTS);
  customers = testApp.app.get<CustomerRepository>(CUSTOMER_REPOSITORY);
  transactionRunner = testApp.app.get<TransactionRunner>(TRANSACTION_RUNNER);
  clock = testApp.app.get<Clock>(CLOCK);
  settings = testApp.app.get<OutboxSettings>(OUTBOX_SETTINGS);
});

afterEach(async () => {
  await dataSource.query(`DELETE FROM customer_account_steps WHERE user_id = ANY($1::uuid[])`, [
    madeUsers.splice(0),
  ]);
});

afterAll(async () => {
  await testApp.close();
});

interface Registration {
  userId: string;
  customerId: string;
  operationId: string;
  email: string;
  document: string;
}

function registration(): Registration {
  const made = {
    userId: randomUUID(),
    customerId: randomUUID(),
    operationId: randomUUID(),
    email: `${randomUUID()}@example.com`,
    document: uniqueValidCpf(),
  };
  madeUsers.push(made.userId);
  return made;
}

async function userCount(registered: Pick<Registration, 'email' | 'document'>): Promise<number> {
  const rows: Array<{ total: number }> = await dataSource.query(
    `SELECT count(*)::int AS total FROM users WHERE email = $1 OR document = $2`,
    [registered.email, registered.document],
  );
  return rows[0].total;
}

async function userExists(userId: string): Promise<boolean> {
  const rows: unknown[] = await dataSource.query(`SELECT 1 FROM users WHERE external_id = $1`, [
    userId,
  ]);
  return rows.length > 0;
}

async function customerOf(userId: string): Promise<string | undefined> {
  const rows: Array<{ external_id: string }> = await dataSource.query(
    `SELECT c.external_id FROM customers c JOIN users u ON u.id = c.user_id WHERE u.external_id = $1`,
    [userId],
  );
  return rows[0]?.external_id;
}

interface StepRow {
  status: string;
  attempts: number;
  due_at: Date;
}

async function stepOf(operationId: string): Promise<StepRow> {
  const rows: StepRow[] = await dataSource.query(
    `SELECT status, attempts, due_at FROM customer_account_steps WHERE operation_id = $1`,
    [operationId],
  );
  return rows[0];
}

async function stepCountOf(userId: string): Promise<number> {
  const rows: Array<{ total: number }> = await dataSource.query(
    `SELECT count(*)::int AS total FROM customer_account_steps WHERE user_id = $1`,
    [userId],
  );
  return rows[0].total;
}

interface Hooks {
  afterOpen?: (registered: Registration) => Promise<void>;
  discardFailure?: Error;
}

function useCaseFor(registered: Registration, hooks: Hooks = {}) {
  const queue = [registered.userId, registered.customerId, registered.operationId];
  const idGenerator: IdGenerator = { generate: () => queue.shift() ?? randomUUID() };
  const saves: Customer[] = [];
  const failures: { saveFailure: Error | null } = { saveFailure: null };
  const wrappedCustomers: CustomerRepository = {
    findById: (id) => customers.findById(id),
    existsByUserId: (userId) => customers.existsByUserId(userId),
    save: (customer) => {
      if (failures.saveFailure) {
        return Promise.reject(failures.saveFailure);
      }
      saves.push(customer);
      return customers.save(customer);
    },
  };
  const wrappedAccounts: CustomerAccounts = {
    findUser: (userId) => accounts.findUser(userId),
    hasCustomerRole: (userId) => accounts.hasCustomerRole(userId),
    open: async (userId, email, name, document) => {
      const opened = await accounts.open(userId, email, name, document);
      await hooks.afterOpen?.(registered);
      return opened;
    },
    discard: (userId) =>
      hooks.discardFailure ? Promise.reject(hooks.discardFailure) : accounts.discard(userId),
  };
  const useCase = new RegisterCustomerUseCase(
    wrappedCustomers,
    idGenerator,
    clock,
    transactionRunner,
    wrappedAccounts,
    steps,
    settings,
  );
  const command = new RegisterCustomerCommand(
    undefined,
    registered.email,
    'Jane Doe',
    registered.document,
    undefined,
    undefined,
  );
  return { useCase, command, failures, saves };
}

describe('a registration on the real adapters', () => {
  describe('when the process stops after the account opened', () => {
    it('discards the account once the processor runs past the grace period, and not before, so the same registration can be sent again', async () => {
      const registered = registration();
      const dueAt = new Date(Date.now() + settings.graceSeconds * 1000);
      await steps.arm(
        {
          operationId: registered.operationId,
          kind: AccountStepKind.DiscardAccount,
          userId: registered.userId,
        },
        dueAt,
      );
      await accounts.open(registered.userId, registered.email, 'Jane Doe', registered.document);
      // The process stops here: the step is never disarmed and the customer is never saved.
      expect(await userCount(registered)).toBe(1);

      await drainAccountSteps(testApp.app, [registered.operationId]);

      expect(await userCount(registered)).toBe(1);
      expect((await stepOf(registered.operationId)).status).toBe('ARMED');

      await drainAccountSteps(
        testApp.app,
        [registered.operationId],
        new Date(dueAt.getTime() + 1000),
      );

      expect(await userCount(registered)).toBe(0);
      expect(await stepOf(registered.operationId)).toMatchObject({ status: 'DONE', attempts: 1 });
      // The email and the document are free again.
      const again = registration();
      const reopened = await accounts.open(
        again.userId,
        registered.email,
        'Jane Doe',
        registered.document,
      );
      expect(reopened.userId).toBe(again.userId);
      await accounts.discard(again.userId);
    });
  });

  describe('when it succeeds', () => {
    it('opens the account, then saves the customer in the transaction that disarmed the step, and leaves the step done', async () => {
      const registered = registration();
      const { useCase, command, saves } = useCaseFor(registered);

      const result = await useCase.execute(command);

      expect(result.id).toBe(registered.customerId);
      expect(result.temporaryPassword).toEqual(expect.any(String));
      expect(await userExists(registered.userId)).toBe(true);
      expect(await customerOf(registered.userId)).toBe(registered.customerId);
      expect(saves).toHaveLength(1);
      expect(await stepOf(registered.operationId)).toMatchObject({ status: 'DONE', attempts: 0 });
    });
  });

  describe('when the customer save fails after the account opened', () => {
    it('leaves no user with that email or document, completes the step and answers the error of the save', async () => {
      const registered = registration();
      const { useCase, command, failures } = useCaseFor(registered);
      const saveFailure = new Error('the customer save failed');
      failures.saveFailure = saveFailure;

      await expect(useCase.execute(command)).rejects.toBe(saveFailure);

      expect(await userCount(registered)).toBe(0);
      expect(await stepOf(registered.operationId)).toMatchObject({ status: 'DONE' });
    });

    it('hands the step to the processor when the discard fails too, answers the first error, and the processor then discards the account', async () => {
      const registered = registration();
      const discardFailure = new Error('identity is down');
      const { useCase, command, failures } = useCaseFor(registered, { discardFailure });
      const saveFailure = new Error('the customer save failed');
      failures.saveFailure = saveFailure;

      await expect(useCase.execute(command)).rejects.toBe(saveFailure);

      expect(await userCount(registered)).toBe(1);
      const handedOver = await stepOf(registered.operationId);
      expect(handedOver.status).toBe('PENDING');
      expect(handedOver.due_at.getTime()).toBeLessThanOrEqual(Date.now());

      await drainAccountSteps(testApp.app, [registered.operationId]);

      expect(await userCount(registered)).toBe(0);
      expect((await stepOf(registered.operationId)).status).toBe('DONE');
    });
  });

  describe('when the processor claimed the armed step before the last step', () => {
    it('answers 409 CONCURRENT_MODIFICATION, saves no customer and still discards the account', async () => {
      const registered = registration();
      const claimAfterOpen = async (): Promise<void> => {
        const claimed = await steps.claimDue(
          new Date(Date.now() + settings.graceSeconds * 1000 + 1000),
          10,
          new Date(Date.now() + 2 * settings.graceSeconds * 1000),
          [registered.operationId],
        );
        expect(claimed).toHaveLength(1);
      };
      const { useCase, command, saves } = useCaseFor(registered, { afterOpen: claimAfterOpen });

      const failure = await useCase.execute(command).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(ConcurrentModificationError);
      expect((failure as ConcurrentModificationError).code).toBe('CONCURRENT_MODIFICATION');
      expect(saves).toHaveLength(0);
      expect(await userCount(registered)).toBe(0);
      expect(await stepOf(registered.operationId)).toMatchObject({ status: 'DONE', attempts: 1 });
    });
  });

  describe('when identity refuses to open the account', () => {
    it('answers the refusal, completes the step and leaves the account that held the email alone', async () => {
      const first = registration();
      await accounts.open(first.userId, first.email, 'Jane Doe', first.document);
      const second = registration();
      const { useCase, saves } = useCaseFor(second);

      await expect(
        useCase.execute(
          new RegisterCustomerCommand(
            undefined,
            first.email,
            'Other Person',
            uniqueValidCpf(),
            undefined,
            undefined,
          ),
        ),
      ).rejects.toBeInstanceOf(EmailAlreadyInUseError);

      expect(await userExists(first.userId)).toBe(true);
      expect(await userExists(second.userId)).toBe(false);
      expect(saves).toHaveLength(0);
      expect(await stepOf(second.operationId)).toMatchObject({ status: 'DONE' });
    });
  });

  describe('a registration over an existing user', () => {
    it('arms no step and writes nothing in identity', async () => {
      const existing = registration();
      await accounts.open(existing.userId, existing.email, 'Jane Doe', existing.document);
      const { useCase, saves } = useCaseFor(registration());

      const result = await useCase.execute(
        new RegisterCustomerCommand(
          existing.userId,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
        ),
      );

      expect(result.temporaryPassword).toBeUndefined();
      expect(await customerOf(existing.userId)).toBe(result.id);
      expect(saves).toHaveLength(1);
      expect(await stepCountOf(existing.userId)).toBe(0);
    });
  });
});
