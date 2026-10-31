import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { FakeCustomerAccounts } from '../../../../../../test/support/fakes/fake-customer-accounts';
import { FakeIdGenerator } from '../../../../../../test/support/fakes/fake-id-generator';
import { FakePendingAccountSteps } from '../../../../../../test/support/fakes/fake-pending-account-steps';
import { FakeTransactionRunner } from '../../../../../../test/support/fakes/fake-transaction-runner';
import { InMemoryCustomerRepository } from '../../../../../../test/support/fakes/in-memory-customer.repository';
import { ConcurrentModificationError } from '../../../../../shared/application/errors/concurrent-modification.error';
import { AmbiguousCustomerRegistrationError } from '../../../domain/errors/ambiguous-customer-registration.error';
import { CustomerAlreadyExistsForUserError } from '../../../domain/errors/customer-already-exists-for-user.error';
import { InvalidAddressError } from '../../../domain/errors/invalid-address.error';
import { InvalidPhoneNumberError } from '../../../domain/errors/invalid-phone-number.error';
import { TargetUserNotFoundError } from '../../../domain/errors/target-user-not-found.error';
import { UserMissingCustomerRoleError } from '../../../domain/errors/user-missing-customer-role.error';
import { OutboxSettings } from '../../outbox-settings';
import { AccountStepKind } from '../../ports/pending-account-steps.port';
import { RegisterCustomerCommand } from './register-customer.command';
import { RegisterCustomerUseCase } from './register-customer.use-case';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const NEW_ACCOUNT = { userId: USER_ID, temporaryPassword: 'aB3dE5fG7h9K' };
// The ids `FakeIdGenerator` hands out, in the order the registration draws them: the id it chooses
// for the account, the id of the customer and the operation id of the discard step.
const CHOSEN_USER_ID = '00000000-0000-4000-8000-000000000001';
const CUSTOMER_ID = '00000000-0000-4000-8000-000000000002';
const OPERATION_ID = '00000000-0000-4000-8000-000000000003';

// The use case reaches the customers, the accounts and the outbox through `transactionRunner.watch`,
// which records the calls in order and tells which of them ran while the transaction was open.
// `existingUser` seeds a user with or without the CUSTOMER role; the new account answers `NEW_ACCOUNT`.
function makeUseCase(existingUser?: { holdsCustomerRole: boolean }, graceSeconds = 300) {
  const customers = new InMemoryCustomerRepository();
  const transactionRunner = new FakeTransactionRunner();
  const accounts = new FakeCustomerAccounts(NEW_ACCOUNT, () => transactionRunner.active);
  if (existingUser) {
    accounts.withUser(USER_ID, existingUser.holdsCustomerRole);
  }
  const clock = new FakeClock();
  const steps = new FakePendingAccountSteps(clock);
  const settings: OutboxSettings = { pollIntervalMs: 5000, graceSeconds, maxAttempts: 10 };
  const useCase = new RegisterCustomerUseCase(
    transactionRunner.watch('customers', customers),
    new FakeIdGenerator(),
    clock,
    transactionRunner,
    transactionRunner.watch('accounts', accounts),
    transactionRunner.watch('steps', steps),
    settings,
  );
  return { useCase, customers, transactionRunner, accounts, steps, clock };
}

const REGISTER_NEW_ACCOUNT = new RegisterCustomerCommand(
  undefined,
  'jane@example.com',
  'Jane Doe',
  '11144477735',
  undefined,
  undefined,
);

describe('RegisterCustomerUseCase', () => {
  it('should register a customer over an existing user holding CUSTOMER', async () => {
    const { useCase, customers } = makeUseCase({ holdsCustomerRole: true });

    const result = await useCase.execute(
      new RegisterCustomerCommand(USER_ID, undefined, undefined, undefined, undefined, undefined),
    );

    expect(result.id).toBe(customers.customers[0].id.value);
    expect(result.temporaryPassword).toBeUndefined();
    expect(customers.customers[0].userId).toBe(USER_ID);
  });

  it('should refuse an existing user without the CUSTOMER role', async () => {
    const { useCase, customers } = makeUseCase({ holdsCustomerRole: false });

    await expect(
      useCase.execute(
        new RegisterCustomerCommand(USER_ID, undefined, undefined, undefined, undefined, undefined),
      ),
    ).rejects.toThrow(UserMissingCustomerRoleError);
    expect(customers.customers).toHaveLength(0);
  });

  it('should refuse a user that already backs a customer', async () => {
    const { useCase, customers } = makeUseCase({ holdsCustomerRole: true });
    customers.existsByUserId = () => Promise.resolve(true);

    await expect(
      useCase.execute(
        new RegisterCustomerCommand(USER_ID, undefined, undefined, undefined, undefined, undefined),
      ),
    ).rejects.toThrow(CustomerAlreadyExistsForUserError);
  });

  it('should refuse a target user that does not exist', async () => {
    const { useCase, customers } = makeUseCase();

    await expect(
      useCase.execute(
        new RegisterCustomerCommand(USER_ID, undefined, undefined, undefined, undefined, undefined),
      ),
    ).rejects.toThrow(TargetUserNotFoundError);
    expect(customers.customers).toHaveLength(0);
  });

  it('should register via the account-creation branch and return the temporary password', async () => {
    const { useCase, customers, accounts } = makeUseCase();

    const result = await useCase.execute(
      new RegisterCustomerCommand(
        undefined,
        'jane@example.com',
        'Jane Doe',
        '11144477735',
        undefined,
        undefined,
      ),
    );

    expect(result.id).toBe(customers.customers[0].id.value);
    expect(result.temporaryPassword).toBe('aB3dE5fG7h9K');
    expect(customers.customers[0].userId).toBe(USER_ID);
    expect(accounts.opened).toMatchObject([
      { email: 'jane@example.com', name: 'Jane Doe', document: '11144477735' },
    ]);
  });

  it('should reject a malformed address', async () => {
    const { useCase } = makeUseCase();

    await expect(
      useCase.execute(
        new RegisterCustomerCommand(
          undefined,
          'jane@example.com',
          'Jane Doe',
          '11144477735',
          { street: '', number: '', district: '', city: '', state: 'ZZ', zipCode: '123' },
          undefined,
        ),
      ),
    ).rejects.toThrow(InvalidAddressError);
  });

  it('should store the phone number it was given on the registered customer', async () => {
    const { useCase, customers } = makeUseCase();

    await useCase.execute(
      new RegisterCustomerCommand(
        undefined,
        'jane@example.com',
        'Jane Doe',
        '11144477735',
        undefined,
        '11987654321',
      ),
    );

    expect(customers.customers[0].phoneNumber?.value).toBe('11987654321');
  });

  it('should reject a malformed phone number', async () => {
    const { useCase } = makeUseCase();

    await expect(
      useCase.execute(
        new RegisterCustomerCommand(
          undefined,
          'jane@example.com',
          'Jane Doe',
          '11144477735',
          undefined,
          '123',
        ),
      ),
    ).rejects.toThrow(InvalidPhoneNumberError);
  });

  it('should refuse a request supplying both an existing user id and account data', async () => {
    const { useCase } = makeUseCase();

    await expect(
      useCase.execute(
        new RegisterCustomerCommand(
          USER_ID,
          'jane@example.com',
          undefined,
          undefined,
          undefined,
          undefined,
        ),
      ),
    ).rejects.toThrow(AmbiguousCustomerRegistrationError);
  });

  it('should refuse a request supplying neither an existing user id nor account data', async () => {
    const { useCase } = makeUseCase();

    await expect(
      useCase.execute(
        new RegisterCustomerCommand(
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
        ),
      ),
    ).rejects.toThrow(AmbiguousCustomerRegistrationError);
  });

  it('should open the account outside the customers transaction, which holds the disarm and the save only', async () => {
    const { useCase, transactionRunner, accounts } = makeUseCase();

    await useCase.execute(REGISTER_NEW_ACCOUNT);

    expect(transactionRunner.runCalls).toBe(1);
    expect(accounts.opened.map((account) => account.insideTransaction)).toEqual([false]);
    expect(transactionRunner.callsInside).toEqual(['steps.disarm', 'customers.save']);
  });

  it('should choose the id of the new account itself, with the id generator, and open the account under it', async () => {
    const { useCase, customers, accounts } = makeUseCase();

    await useCase.execute(
      new RegisterCustomerCommand(
        undefined,
        'jane@example.com',
        'Jane Doe',
        '11144477735',
        undefined,
        undefined,
      ),
    );

    // The first id `FakeIdGenerator` hands out; the customer takes the next one.
    expect(accounts.opened.map((account) => account.userId)).toEqual([
      '00000000-0000-4000-8000-000000000001',
    ]);
    expect(customers.customers[0].id.value).toBe('00000000-0000-4000-8000-000000000002');
  });

  it('should arm the discard step, open the account, then disarm the step and save the customer, in that order', async () => {
    const { useCase, customers, transactionRunner, steps } = makeUseCase();

    await useCase.execute(REGISTER_NEW_ACCOUNT);

    expect(transactionRunner.calls).toEqual([
      'steps.arm',
      'accounts.open',
      'steps.disarm',
      'customers.save',
    ]);
    expect(steps.stateOf(OPERATION_ID).step).toEqual({
      operationId: OPERATION_ID,
      kind: AccountStepKind.DiscardAccount,
      userId: CHOSEN_USER_ID,
    });
    expect(customers.customers.map((customer) => customer.id.value)).toEqual([CUSTOMER_ID]);
  });

  it('should arm the step due after the grace period of the settings, and leave it done once the customer is saved', async () => {
    const { useCase, steps, clock } = makeUseCase(undefined, 120);

    await useCase.execute(REGISTER_NEW_ACCOUNT);

    expect(steps.stateOf(OPERATION_ID)).toMatchObject({
      status: 'DONE',
      attempts: 0,
      dueAt: new Date(clock.now().getTime() + 120_000),
    });
  });

  describe('when the opening of the account fails', () => {
    it('should discard the account at once, outside the transaction, complete the step and answer the opening error', async () => {
      const { useCase, customers, transactionRunner, accounts, steps } = makeUseCase();
      const opening = new Error('the email is taken');
      accounts.refuseOpenWith(opening);

      await expect(useCase.execute(REGISTER_NEW_ACCOUNT)).rejects.toBe(opening);

      expect(accounts.discarded).toEqual([CHOSEN_USER_ID]);
      expect(steps.stateOf(OPERATION_ID).status).toBe('DONE');
      expect(customers.customers).toHaveLength(0);
      expect(transactionRunner.runCalls).toBe(0);
    });
  });

  describe('when the customer save fails after the account opened', () => {
    it('should discard the account at once, outside the transaction, complete the step and answer the error of the save', async () => {
      const { useCase, customers, transactionRunner, accounts, steps } = makeUseCase();
      const saveFailure = new Error('the customer save failed');
      customers.save = () => Promise.reject(saveFailure);

      await expect(useCase.execute(REGISTER_NEW_ACCOUNT)).rejects.toBe(saveFailure);

      expect(transactionRunner.callsInside).toEqual(['steps.disarm', 'customers.save']);
      expect(accounts.opened).toHaveLength(1);
      expect(accounts.discarded).toEqual([CHOSEN_USER_ID]);
      expect(steps.stateOf(OPERATION_ID).status).toBe('DONE');
      expect(customers.customers).toHaveLength(0);
    });
  });

  describe('when the processor claimed the armed step before the last step', () => {
    it('should answer 409 CONCURRENT_MODIFICATION, save no customer and still discard the account', async () => {
      const { useCase, customers, transactionRunner, accounts, steps, clock } = makeUseCase();
      // The grace period passes while the request is still working, and the processor claims the step.
      const open = accounts.open.bind(accounts);
      accounts.open = async (...args: Parameters<typeof open>) => {
        const opened = await open(...args);
        clock.advanceSeconds(300);
        await steps.claimDue(clock.now(), 10, new Date(clock.now().getTime() + 300_000), [
          OPERATION_ID,
        ]);
        return opened;
      };

      const failure = await useCase.execute(REGISTER_NEW_ACCOUNT).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(ConcurrentModificationError);
      expect((failure as ConcurrentModificationError).code).toBe('CONCURRENT_MODIFICATION');
      expect(transactionRunner.callsInside).toEqual(['steps.disarm']);
      expect(customers.customers).toHaveLength(0);
      expect(accounts.discarded).toEqual([CHOSEN_USER_ID]);
      expect(steps.stateOf(OPERATION_ID).status).toBe('DONE');
    });
  });

  describe('when the discard fails too', () => {
    it('should leave the step to the processor, due now, and answer the first error', async () => {
      const { useCase, accounts, steps, clock } = makeUseCase();
      const opening = new Error('identity is down');
      accounts.refuseOpenWith(opening).refuseDiscardWith(new Error('identity is still down'));

      await expect(useCase.execute(REGISTER_NEW_ACCOUNT)).rejects.toBe(opening);

      expect(steps.stateOf(OPERATION_ID)).toMatchObject({ status: 'PENDING', dueAt: clock.now() });
    });

    it('should still answer the first error when the step cannot be handed to the processor either', async () => {
      const { useCase, accounts, steps } = makeUseCase();
      const opening = new Error('identity is down');
      accounts.refuseOpenWith(opening).refuseDiscardWith(new Error('identity is still down'));
      steps.release = () => Promise.reject(new Error('the database is down'));

      await expect(useCase.execute(REGISTER_NEW_ACCOUNT)).rejects.toBe(opening);

      expect(steps.stateOf(OPERATION_ID).status).toBe('ARMED');
    });
  });

  describe('when nothing has been opened yet', () => {
    it('should open no account when the step cannot be armed, and have nothing to discard', async () => {
      const { useCase, accounts, steps } = makeUseCase();
      const armFailure = new Error('the database is down');
      steps.arm = () => Promise.reject(armFailure);

      await expect(useCase.execute(REGISTER_NEW_ACCOUNT)).rejects.toBe(armFailure);

      expect(accounts.opened).toEqual([]);
      expect(accounts.discarded).toEqual([]);
    });

    it('should arm no step and open no account for a malformed address or phone number', async () => {
      const { useCase, accounts, steps } = makeUseCase();

      await expect(
        useCase.execute(
          new RegisterCustomerCommand(
            undefined,
            'jane@example.com',
            'Jane Doe',
            '11144477735',
            { street: '', number: '', district: '', city: '', state: 'ZZ', zipCode: '123' },
            undefined,
          ),
        ),
      ).rejects.toThrow(InvalidAddressError);
      await expect(
        useCase.execute(
          new RegisterCustomerCommand(
            undefined,
            'jane@example.com',
            'Jane Doe',
            '11144477735',
            undefined,
            '123',
          ),
        ),
      ).rejects.toThrow(InvalidPhoneNumberError);

      expect(steps.stored.size).toBe(0);
      expect(accounts.opened).toEqual([]);
    });
  });

  describe('a registration over an existing user', () => {
    it('should arm no step and write nothing in identity, saving the customer in the customers transaction', async () => {
      const { useCase, customers, transactionRunner, accounts, steps } = makeUseCase({
        holdsCustomerRole: true,
      });

      const result = await useCase.execute(
        new RegisterCustomerCommand(USER_ID, undefined, undefined, undefined, undefined, undefined),
      );

      expect(result.id).toBe(customers.customers[0].id.value);
      expect(steps.stored.size).toBe(0);
      expect(accounts.opened).toEqual([]);
      expect(accounts.discarded).toEqual([]);
      expect(transactionRunner.calls).not.toContain('steps.arm');
      expect(transactionRunner.runCalls).toBe(1);
      expect(transactionRunner.callsInside).toContain('customers.save');
    });
  });
});
