import { describe, expect, it } from 'vitest';
import {
  EffectiveAccessDto,
  GetUserByIdHandler,
  GetUserByIdQuery,
  GetUserEffectiveAccessHandler,
  GetUserEffectiveAccessQuery,
  UserDto,
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

// The gateway uses only `execute` of the identity module's two handlers. Each stand-in answers for
// the one user it knows, and like identity itself it answers a user it does not know with nothing:
// no user for the lookup, and empty roles and permissions for the effective access.
function gatewayFor(access: EffectiveAccessDto): WorkOrderActorsGateway {
  const getUserById = {
    execute: (query: GetUserByIdQuery) => Promise.resolve(query.userId === USER_ID ? USER : null),
  } as unknown as GetUserByIdHandler;
  const getUserEffectiveAccess = {
    execute: (query: GetUserEffectiveAccessQuery) =>
      Promise.resolve(query.userId === USER_ID ? access : { roles: [], permissions: [] }),
  } as unknown as GetUserEffectiveAccessHandler;
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
  });
});
