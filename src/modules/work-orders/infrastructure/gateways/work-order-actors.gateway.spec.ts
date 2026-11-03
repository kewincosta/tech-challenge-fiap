import { describe, expect, it } from 'vitest';
import {
  EffectiveAccessDto,
  GetUserByIdUseCase,
  GetUserByIdQuery,
  GetUserEffectiveAccessUseCase,
  GetUserEffectiveAccessQuery,
  UserDto,
  UserNotFoundError,
} from '../../../identity';
import { WorkOrderActorsGateway } from './work-order-actors.gateway';

const USER_ID = '55555555-5555-4555-8555-555555555555';
const UNKNOWN_USER_ID = '66666666-6666-4666-8666-666666666666';

const USER: UserDto = {
  id: USER_ID,
  email: 'bob@example.com',
  name: 'Bob Mechanic',
  status: 'ACTIVE',
  mustChangePassword: false,
  createdAt: '2026-08-31T12:00:00.000Z',
};

// The gateway uses only `execute` of the identity module's two use cases. Each stand-in answers for
// the one user it knows, and like identity itself it refuses a user it does not know: the lookup
// with its not-found error, the effective access with empty roles and permissions. A lookup
// failure, when given, is what the lookup throws for the user it knows.
function gatewayFor(access: EffectiveAccessDto, lookupFailure?: Error): WorkOrderActorsGateway {
  const getUserById = {
    execute: (query: GetUserByIdQuery) => {
      if (lookupFailure) {
        return Promise.reject(lookupFailure);
      }
      return query.userId === USER_ID
        ? Promise.resolve(USER)
        : Promise.reject(new UserNotFoundError());
    },
  } as unknown as GetUserByIdUseCase;
  const getUserEffectiveAccess = {
    execute: (query: GetUserEffectiveAccessQuery) =>
      Promise.resolve(query.userId === USER_ID ? access : { roles: [], permissions: [] }),
  } as unknown as GetUserEffectiveAccessUseCase;
  return new WorkOrderActorsGateway(getUserEffectiveAccess, getUserById);
}

const NO_CAPABILITIES = {
  decidesAnyBudget: false,
  cancelsInExecution: false,
  managesWorkOrders: false,
};

describe('WorkOrderActorsGateway', () => {
  describe('capabilitiesOf', () => {
    it('should grant the budget capability alone to a holder of work-orders:decide', async () => {
      const actors = gatewayFor({
        roles: ['SERVICE_ADVISOR'],
        permissions: ['work-orders:decide'],
      });

      expect(await actors.capabilitiesOf(USER_ID)).toEqual({
        ...NO_CAPABILITIES,
        decidesAnyBudget: true,
      });
    });

    it('should grant the in-execution cancellation capability alone to a holder of work-orders:cancel-in-execution', async () => {
      const actors = gatewayFor({
        roles: ['ADMIN'],
        permissions: ['work-orders:cancel-in-execution'],
      });

      expect(await actors.capabilitiesOf(USER_ID)).toEqual({
        ...NO_CAPABILITIES,
        cancelsInExecution: true,
      });
    });

    it('should grant the management capability alone to a holder of work-orders:manage', async () => {
      const actors = gatewayFor({ roles: ['ADMIN'], permissions: ['work-orders:manage'] });

      expect(await actors.capabilitiesOf(USER_ID)).toEqual({
        ...NO_CAPABILITIES,
        managesWorkOrders: true,
      });
    });

    it('should not take work-orders:cancel, or any other permission, for one of the three capabilities', async () => {
      const actors = gatewayFor({
        roles: ['SERVICE_ADVISOR'],
        permissions: ['work-orders:cancel', 'work-orders:read', 'work-orders:execute'],
      });

      expect(await actors.capabilitiesOf(USER_ID)).toEqual(NO_CAPABILITIES);
    });

    it('should grant nothing to a user the identity module does not know', async () => {
      const actors = gatewayFor({
        roles: ['ADMIN'],
        permissions: [
          'work-orders:decide',
          'work-orders:cancel-in-execution',
          'work-orders:manage',
        ],
      });

      expect(await actors.capabilitiesOf(UNKNOWN_USER_ID)).toEqual(NO_CAPABILITIES);
    });
  });

  describe('findMechanicCandidate', () => {
    it('should report a user holding the MECHANIC role as a mechanic', async () => {
      const actors = gatewayFor({ roles: ['MECHANIC'], permissions: [] });

      expect(await actors.findMechanicCandidate(USER_ID)).toEqual({ isMechanic: true });
    });

    it('should report a user without the MECHANIC role as found and not a mechanic', async () => {
      const actors = gatewayFor({ roles: ['SERVICE_ADVISOR'], permissions: [] });

      expect(await actors.findMechanicCandidate(USER_ID)).toEqual({ isMechanic: false });
    });

    it('should answer null for a user the identity module does not know', async () => {
      const actors = gatewayFor({ roles: ['MECHANIC'], permissions: [] });

      expect(await actors.findMechanicCandidate(UNKNOWN_USER_ID)).toBeNull();
    });

    it('should let any other error from the identity module through', async () => {
      const failure = new Error('database is down');
      const actors = gatewayFor({ roles: ['MECHANIC'], permissions: [] }, failure);

      await expect(actors.findMechanicCandidate(USER_ID)).rejects.toBe(failure);
    });
  });
});
