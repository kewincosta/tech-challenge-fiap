import { describe, expect, it } from 'vitest';
import {
  DiscardOpenedAccountCommand,
  DiscardOpenedAccountUseCase,
  EffectiveAccessDto,
  GetUserByIdUseCase,
  GetUserByIdQuery,
  GetUserEffectiveAccessUseCase,
  GetUserEffectiveAccessQuery,
  RegisteredUserDto,
  RegisterUserCommand,
  RegisterUserUseCase,
  UserDto,
  UserNotFoundError,
} from '../../../identity';
import { CustomerAccountsGateway } from './customer-accounts.gateway';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const UNKNOWN_USER_ID = '66666666-6666-4666-8666-666666666666';
const NEW_USER_ID = '77777777-7777-4777-8777-777777777777';

const USER: UserDto = {
  id: USER_ID,
  email: 'jane@example.com',
  name: 'Jane Doe',
  status: 'ACTIVE',
  mustChangePassword: false,
  createdAt: '2026-08-31T12:00:00.000Z',
};

interface Setup {
  access?: EffectiveAccessDto;
  registered?: RegisteredUserDto | Error;
  /** What the user lookup throws for the user it knows, in place of answering. */
  lookupFailure?: Error;
  /** What the discard use case rejects with, in place of answering. */
  discardFailure?: Error;
}

// The gateway uses only `execute` of the identity module's four use cases. The first two answer
// for the one user they know and, like identity, refuse any other: the lookup with its not-found
// error, the effective access with empty roles and permissions. The register and discard use cases
// keep the commands they receive.
function gatewayFor(setup: Setup = {}): {
  gateway: CustomerAccountsGateway;
  registerCommands: RegisterUserCommand[];
  discardCommands: DiscardOpenedAccountCommand[];
} {
  const registerCommands: RegisterUserCommand[] = [];
  const discardCommands: DiscardOpenedAccountCommand[] = [];
  const getUserById = {
    execute: (query: GetUserByIdQuery) => {
      if (setup.lookupFailure) {
        return Promise.reject(setup.lookupFailure);
      }
      return query.userId === USER_ID
        ? Promise.resolve(USER)
        : Promise.reject(new UserNotFoundError());
    },
  } as unknown as GetUserByIdUseCase;
  const getUserEffectiveAccess = {
    execute: (query: GetUserEffectiveAccessQuery) =>
      Promise.resolve(
        query.userId === USER_ID
          ? (setup.access ?? { roles: [], permissions: [] })
          : { roles: [], permissions: [] },
      ),
  } as unknown as GetUserEffectiveAccessUseCase;
  const registerUser = {
    execute: (command: RegisterUserCommand) => {
      registerCommands.push(command);
      const registered = setup.registered ?? { id: NEW_USER_ID, temporaryPassword: 'aB3dE5fG7h9K' };
      return registered instanceof Error ? Promise.reject(registered) : Promise.resolve(registered);
    },
  } as unknown as RegisterUserUseCase;
  const discardOpenedAccount = {
    execute: (command: DiscardOpenedAccountCommand) => {
      discardCommands.push(command);
      return setup.discardFailure ? Promise.reject(setup.discardFailure) : Promise.resolve();
    },
  } as unknown as DiscardOpenedAccountUseCase;
  return {
    gateway: new CustomerAccountsGateway(
      getUserById,
      getUserEffectiveAccess,
      registerUser,
      discardOpenedAccount,
    ),
    registerCommands,
    discardCommands,
  };
}

describe('CustomerAccountsGateway', () => {
  describe('findUser', () => {
    it('should map the identity module answer to the id alone', async () => {
      const { gateway } = gatewayFor();

      expect(await gateway.findUser(USER_ID)).toEqual({ id: USER_ID });
    });

    it('should answer null for a user the identity module does not know', async () => {
      const { gateway } = gatewayFor();

      expect(await gateway.findUser(UNKNOWN_USER_ID)).toBeNull();
    });

    it('should let any other error from the identity module through', async () => {
      const failure = new Error('database is down');
      const { gateway } = gatewayFor({ lookupFailure: failure });

      await expect(gateway.findUser(USER_ID)).rejects.toBe(failure);
    });
  });

  describe('hasCustomerRole', () => {
    it('should be true for a user holding the CUSTOMER role', async () => {
      const { gateway } = gatewayFor({ access: { roles: ['CUSTOMER'], permissions: [] } });

      expect(await gateway.hasCustomerRole(USER_ID)).toBe(true);
    });

    it('should be false for a user holding other roles only', async () => {
      const { gateway } = gatewayFor({
        access: { roles: ['MECHANIC', 'SERVICE_ADVISOR'], permissions: [] },
      });

      expect(await gateway.hasCustomerRole(USER_ID)).toBe(false);
    });

    it('should be false for a user the identity module does not know', async () => {
      const { gateway } = gatewayFor({ access: { roles: ['CUSTOMER'], permissions: [] } });

      expect(await gateway.hasCustomerRole(UNKNOWN_USER_ID)).toBe(false);
    });
  });

  describe('open', () => {
    it('should hand the chosen id, the email, the name and the document to identity as a staff-issued account with no password', async () => {
      const { gateway, registerCommands } = gatewayFor();

      await gateway.open(NEW_USER_ID, 'jane@example.com', 'Jane Doe', '11144477735');

      expect(registerCommands).toEqual([
        new RegisterUserCommand(
          'jane@example.com',
          'Jane Doe',
          undefined,
          '11144477735',
          true,
          NEW_USER_ID,
        ),
      ]);
    });

    it('should answer the new user id and the temporary password identity issued', async () => {
      const { gateway } = gatewayFor();

      const account = await gateway.open(
        NEW_USER_ID,
        'jane@example.com',
        'Jane Doe',
        '11144477735',
      );

      expect(account).toEqual({ userId: NEW_USER_ID, temporaryPassword: 'aB3dE5fG7h9K' });
    });

    it('should let the error of the identity module through', async () => {
      const failure = new Error('email already in use');
      const { gateway } = gatewayFor({ registered: failure });

      await expect(
        gateway.open(NEW_USER_ID, 'jane@example.com', 'Jane Doe', '11144477735'),
      ).rejects.toBe(failure);
    });
  });

  describe('discard', () => {
    it('should hand the user id to the discard use case', async () => {
      const { gateway, discardCommands } = gatewayFor();

      await gateway.discard(NEW_USER_ID);

      expect(discardCommands).toEqual([new DiscardOpenedAccountCommand(NEW_USER_ID)]);
    });

    it('should let the error of the identity module through', async () => {
      const failure = new Error('the account is in use');
      const { gateway } = gatewayFor({ discardFailure: failure });

      await expect(gateway.discard(NEW_USER_ID)).rejects.toBe(failure);
    });
  });
});
