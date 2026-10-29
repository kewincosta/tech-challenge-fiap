import { describe, expect, it } from 'vitest';
import {
  EffectiveAccessDto,
  GetUserByIdHandler,
  GetUserByIdQuery,
  GetUserEffectiveAccessHandler,
  GetUserEffectiveAccessQuery,
  RegisteredUserDto,
  RegisterUserCommand,
  RegisterUserHandler,
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
}

// The gateway uses only `execute` of the identity module's three handlers. The first two answer
// for the one user they know and, like identity, refuse any other: the lookup with its not-found
// error, the effective access with empty roles and permissions. The register handler keeps the
// commands it receives.
function gatewayFor(setup: Setup = {}): {
  gateway: CustomerAccountsGateway;
  registerCommands: RegisterUserCommand[];
} {
  const registerCommands: RegisterUserCommand[] = [];
  const getUserById = {
    execute: (query: GetUserByIdQuery) => {
      if (setup.lookupFailure) {
        return Promise.reject(setup.lookupFailure);
      }
      return query.userId === USER_ID
        ? Promise.resolve(USER)
        : Promise.reject(new UserNotFoundError());
    },
  } as unknown as GetUserByIdHandler;
  const getUserEffectiveAccess = {
    execute: (query: GetUserEffectiveAccessQuery) =>
      Promise.resolve(
        query.userId === USER_ID
          ? (setup.access ?? { roles: [], permissions: [] })
          : { roles: [], permissions: [] },
      ),
  } as unknown as GetUserEffectiveAccessHandler;
  const registerUser = {
    execute: (command: RegisterUserCommand) => {
      registerCommands.push(command);
      const registered = setup.registered ?? { id: NEW_USER_ID, temporaryPassword: 'aB3dE5fG7h9K' };
      return registered instanceof Error ? Promise.reject(registered) : Promise.resolve(registered);
    },
  } as unknown as RegisterUserHandler;
  return {
    gateway: new CustomerAccountsGateway(getUserById, getUserEffectiveAccess, registerUser),
    registerCommands,
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
    it('should hand the email, the name and the document to identity as a staff-issued account with no password', async () => {
      const { gateway, registerCommands } = gatewayFor();

      await gateway.open('jane@example.com', 'Jane Doe', '11144477735');

      expect(registerCommands).toEqual([
        new RegisterUserCommand('jane@example.com', 'Jane Doe', undefined, '11144477735', true),
      ]);
    });

    it('should answer the new user id and the temporary password identity issued', async () => {
      const { gateway } = gatewayFor();

      const account = await gateway.open('jane@example.com', 'Jane Doe', '11144477735');

      expect(account).toEqual({ userId: NEW_USER_ID, temporaryPassword: 'aB3dE5fG7h9K' });
    });

    it('should let the error of the identity module through', async () => {
      const failure = new Error('email already in use');
      const { gateway } = gatewayFor({ registered: failure });

      await expect(gateway.open('jane@example.com', 'Jane Doe', '11144477735')).rejects.toBe(
        failure,
      );
    });
  });
});
