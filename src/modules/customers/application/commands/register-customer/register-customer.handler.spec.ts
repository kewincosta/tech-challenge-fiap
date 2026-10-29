import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { FakeCustomerAccounts } from '../../../../../../test/support/fakes/fake-customer-accounts';
import { FakeIdGenerator } from '../../../../../../test/support/fakes/fake-id-generator';
import { FakeTransactionRunner } from '../../../../../../test/support/fakes/fake-transaction-runner';
import { InMemoryCustomerRepository } from '../../../../../../test/support/fakes/in-memory-customer.repository';
import { AmbiguousCustomerRegistrationError } from '../../../domain/errors/ambiguous-customer-registration.error';
import { CustomerAlreadyExistsForUserError } from '../../../domain/errors/customer-already-exists-for-user.error';
import { InvalidAddressError } from '../../../domain/errors/invalid-address.error';
import { InvalidPhoneNumberError } from '../../../domain/errors/invalid-phone-number.error';
import { TargetUserNotFoundError } from '../../../domain/errors/target-user-not-found.error';
import { UserMissingCustomerRoleError } from '../../../domain/errors/user-missing-customer-role.error';
import { RegisterCustomerCommand } from './register-customer.command';
import { RegisterCustomerHandler } from './register-customer.handler';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const NEW_ACCOUNT = { userId: USER_ID, temporaryPassword: 'aB3dE5fG7h9K' };

/** `existingUser` seeds a user with or without the CUSTOMER role; the new account answers `NEW_ACCOUNT`. */
function makeHandler(existingUser?: { holdsCustomerRole: boolean }) {
  const customers = new InMemoryCustomerRepository();
  const transactionRunner = new FakeTransactionRunner();
  const accounts = new FakeCustomerAccounts(NEW_ACCOUNT, () => transactionRunner.active);
  if (existingUser) {
    accounts.withUser(USER_ID, existingUser.holdsCustomerRole);
  }
  const handler = new RegisterCustomerHandler(
    customers,
    new FakeIdGenerator(),
    new FakeClock(),
    transactionRunner,
    accounts,
  );
  return { handler, customers, transactionRunner, accounts };
}

describe('RegisterCustomerHandler', () => {
  it('should register a customer over an existing user holding CUSTOMER', async () => {
    const { handler, customers } = makeHandler({ holdsCustomerRole: true });

    const result = await handler.execute(
      new RegisterCustomerCommand(USER_ID, undefined, undefined, undefined, undefined, undefined),
    );

    expect(result.temporaryPassword).toBeUndefined();
    expect(customers.customers[0].userId).toBe(USER_ID);
  });

  it('should refuse an existing user without the CUSTOMER role', async () => {
    const { handler, customers } = makeHandler({ holdsCustomerRole: false });

    await expect(
      handler.execute(
        new RegisterCustomerCommand(USER_ID, undefined, undefined, undefined, undefined, undefined),
      ),
    ).rejects.toThrow(UserMissingCustomerRoleError);
    expect(customers.customers).toHaveLength(0);
  });

  it('should refuse a user that already backs a customer', async () => {
    const { handler, customers } = makeHandler({ holdsCustomerRole: true });
    customers.existsByUserId = () => Promise.resolve(true);

    await expect(
      handler.execute(
        new RegisterCustomerCommand(USER_ID, undefined, undefined, undefined, undefined, undefined),
      ),
    ).rejects.toThrow(CustomerAlreadyExistsForUserError);
  });

  it('should refuse a target user that does not exist', async () => {
    const { handler, customers } = makeHandler();

    await expect(
      handler.execute(
        new RegisterCustomerCommand(USER_ID, undefined, undefined, undefined, undefined, undefined),
      ),
    ).rejects.toThrow(TargetUserNotFoundError);
    expect(customers.customers).toHaveLength(0);
  });

  it('should register via the account-creation branch and return the temporary password', async () => {
    const { handler, customers, accounts } = makeHandler();

    const result = await handler.execute(
      new RegisterCustomerCommand(
        undefined,
        'jane@example.com',
        'Jane Doe',
        '11144477735',
        undefined,
        undefined,
      ),
    );

    expect(result.temporaryPassword).toBe('aB3dE5fG7h9K');
    expect(customers.customers[0].userId).toBe(USER_ID);
    expect(accounts.opened).toMatchObject([
      { email: 'jane@example.com', name: 'Jane Doe', document: '11144477735' },
    ]);
  });

  it('should reject a malformed address', async () => {
    const { handler } = makeHandler();

    await expect(
      handler.execute(
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

  it('should reject a malformed phone number', async () => {
    const { handler } = makeHandler();

    await expect(
      handler.execute(
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
    const { handler } = makeHandler();

    await expect(
      handler.execute(
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
    const { handler } = makeHandler();

    await expect(
      handler.execute(
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

  it('should run the whole registration inside one transaction, the account opening included', async () => {
    const { handler, transactionRunner, accounts } = makeHandler();

    await handler.execute(
      new RegisterCustomerCommand(
        undefined,
        'jane@example.com',
        'Jane Doe',
        '11144477735',
        undefined,
        undefined,
      ),
    );

    expect(transactionRunner.runCalls).toBe(1);
    expect(accounts.opened.map((account) => account.insideTransaction)).toEqual([true]);
  });
});
