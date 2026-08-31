import { describe, expect, it } from 'vitest';
import {
  stubCommandBus,
  stubQueryBus,
} from '../../../../../../test/support/fakes/bus.stubs';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { FakeIdGenerator } from '../../../../../../test/support/fakes/fake-id-generator';
import { FakeTransactionRunner } from '../../../../../../test/support/fakes/fake-transaction-runner';
import { InMemoryCustomerRepository } from '../../../../../../test/support/fakes/in-memory-customer.repository';
import { RegisterUserCommand } from '../../../../users/application/commands/register-user/register-user.command';
import { AmbiguousCustomerRegistrationError } from '../../../domain/errors/ambiguous-customer-registration.error';
import { CustomerAlreadyExistsForUserError } from '../../../domain/errors/customer-already-exists-for-user.error';
import { TargetUserNotFoundError } from '../../../domain/errors/target-user-not-found.error';
import { UserMissingCustomerRoleError } from '../../../domain/errors/user-missing-customer-role.error';
import { RegisterCustomerCommand } from './register-customer.command';
import { RegisterCustomerHandler } from './register-customer.handler';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const EXISTING_USER_DTO = {
  id: USER_ID,
  email: 'jane@example.com',
  name: 'Jane Doe',
  status: 'ACTIVE',
  mustChangePassword: false,
  createdAt: '2026-08-31T00:00:00.000Z',
};

function makeHandler() {
  const customers = new InMemoryCustomerRepository();
  const idGenerator = new FakeIdGenerator();
  const clock = new FakeClock();
  const transactionRunner = new FakeTransactionRunner();
  const commandBus = stubCommandBus();
  const queryBus = stubQueryBus();
  const handler = new RegisterCustomerHandler(
    customers,
    idGenerator,
    clock,
    transactionRunner,
    commandBus.bus,
    queryBus.bus,
  );
  return { handler, customers, transactionRunner, commandBus, queryBus };
}

describe('RegisterCustomerHandler', () => {
  it('should register a customer over an existing user holding CUSTOMER', async () => {
    const { handler, customers, queryBus } = makeHandler();
    queryBus.execute
      .mockResolvedValueOnce(EXISTING_USER_DTO)
      .mockResolvedValueOnce({ roles: ['CUSTOMER'], permissions: [] });

    const result = await handler.execute(
      new RegisterCustomerCommand(USER_ID, undefined, undefined, undefined, undefined, undefined),
    );

    expect(result.temporaryPassword).toBeUndefined();
    expect(customers.customers[0].userId).toBe(USER_ID);
  });

  it('should refuse an existing user without the CUSTOMER role', async () => {
    const { handler, queryBus } = makeHandler();
    queryBus.execute
      .mockResolvedValueOnce(EXISTING_USER_DTO)
      .mockResolvedValueOnce({ roles: ['MECHANIC'], permissions: [] });

    await expect(
      handler.execute(
        new RegisterCustomerCommand(USER_ID, undefined, undefined, undefined, undefined, undefined),
      ),
    ).rejects.toThrow(UserMissingCustomerRoleError);
  });

  it('should refuse a user that already backs a customer', async () => {
    const { handler, customers, queryBus } = makeHandler();
    queryBus.execute
      .mockResolvedValueOnce(EXISTING_USER_DTO)
      .mockResolvedValueOnce({ roles: ['CUSTOMER'], permissions: [] });
    customers.existsByUserId = () => Promise.resolve(true);

    await expect(
      handler.execute(
        new RegisterCustomerCommand(USER_ID, undefined, undefined, undefined, undefined, undefined),
      ),
    ).rejects.toThrow(CustomerAlreadyExistsForUserError);
  });

  it('should refuse a target user that does not exist', async () => {
    const { handler, queryBus } = makeHandler();
    queryBus.execute.mockResolvedValueOnce(null);

    await expect(
      handler.execute(
        new RegisterCustomerCommand(USER_ID, undefined, undefined, undefined, undefined, undefined),
      ),
    ).rejects.toThrow(TargetUserNotFoundError);
  });

  it('should register via the account-creation branch and return the temporary password', async () => {
    const { handler, customers, commandBus } = makeHandler();
    commandBus.execute.mockResolvedValueOnce({ id: USER_ID, temporaryPassword: 'aB3dE5fG7h9K' });

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
    expect(commandBus.execute).toHaveBeenCalledWith(
      new RegisterUserCommand('jane@example.com', 'Jane Doe', undefined, '11144477735', true),
    );
  });

  it('should refuse a request supplying both an existing user id and account data', async () => {
    const { handler } = makeHandler();

    await expect(
      handler.execute(
        new RegisterCustomerCommand(USER_ID, 'jane@example.com', undefined, undefined, undefined, undefined),
      ),
    ).rejects.toThrow(AmbiguousCustomerRegistrationError);
  });

  it('should refuse a request supplying neither an existing user id nor account data', async () => {
    const { handler } = makeHandler();

    await expect(
      handler.execute(
        new RegisterCustomerCommand(undefined, undefined, undefined, undefined, undefined, undefined),
      ),
    ).rejects.toThrow(AmbiguousCustomerRegistrationError);
  });

  it('should run the whole registration inside one transaction', async () => {
    const { handler, transactionRunner, commandBus } = makeHandler();
    commandBus.execute.mockResolvedValueOnce({ id: USER_ID, temporaryPassword: 'aB3dE5fG7h9K' });

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
  });
});
