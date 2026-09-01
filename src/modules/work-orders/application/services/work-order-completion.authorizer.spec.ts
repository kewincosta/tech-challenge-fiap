import { describe, expect, it } from 'vitest';
import { stubQueryBus } from '../../../../../test/support/fakes/bus.stubs';
import { EffectiveAccessDto } from '../../../authorization/application/dtos/effective-access.dto';
import { GetUserEffectiveAccessQuery } from '../../../authorization/application/queries/get-user-effective-access/get-user-effective-access.query';
import { WorkOrder } from '../../domain/entities/work-order';
import { CompletionForbiddenError } from '../../domain/errors/completion-forbidden.error';
import { WorkOrderNotFoundError } from '../../domain/errors/work-order-not-found.error';
import { WorkOrderId } from '../../domain/value-objects/work-order-id';
import { WorkOrderNumber } from '../../domain/value-objects/work-order-number';
import { WorkOrderCompletionAuthorizer } from './work-order-completion.authorizer';

const CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';
const VEHICLE_ID = '33333333-3333-4333-8333-333333333333';
const CREATOR_ID = '44444444-4444-4444-8444-444444444444';
const MECHANIC_ID = '55555555-5555-4555-8555-555555555555';
const OTHER_MECHANIC_ID = '66666666-6666-4666-8666-666666666666';

function workOrder(assignedMechanicUserId: string | null): WorkOrder {
  const opened = WorkOrder.open({
    id: WorkOrderId.create('11111111-1111-4111-8111-111111111111'),
    number: WorkOrderNumber.create('A1B090-2026'),
    customerId: CUSTOMER_ID,
    vehicleId: VEHICLE_ID,
    createdByUserId: CREATOR_ID,
    customerName: 'Jane Doe',
    vehiclePlate: 'ABC1234',
    vehicleBrand: 'Toyota',
    vehicleModel: 'Corolla',
    vehicleYear: 2020,
    now: new Date(),
  });
  if (assignedMechanicUserId) {
    opened.assignMechanic({
      mechanicUserId: assignedMechanicUserId,
      actorUserId: CREATOR_ID,
      now: new Date(),
    });
  }
  return opened;
}

function stubAccess(access: EffectiveAccessDto): ReturnType<typeof stubQueryBus> {
  const queryBus = stubQueryBus();
  queryBus.execute.mockImplementation((query: unknown) => {
    if (query instanceof GetUserEffectiveAccessQuery) {
      return Promise.resolve(access);
    }
    return Promise.resolve(null);
  });
  return queryBus;
}

describe('WorkOrderCompletionAuthorizer', () => {
  it('admits a holder of work-orders:manage, whoever they are', async () => {
    const queryBus = stubAccess({ roles: ['ADMIN'], permissions: ['work-orders:manage'] });
    const authorizer = new WorkOrderCompletionAuthorizer(queryBus.bus);

    await expect(
      authorizer.assertMayComplete(workOrder(OTHER_MECHANIC_ID), MECHANIC_ID),
    ).resolves.toBeUndefined();
  });

  it('admits the assigned mechanic without work-orders:manage', async () => {
    const queryBus = stubAccess({ roles: ['MECHANIC'], permissions: [] });
    const authorizer = new WorkOrderCompletionAuthorizer(queryBus.bus);

    await expect(
      authorizer.assertMayComplete(workOrder(MECHANIC_ID), MECHANIC_ID),
    ).resolves.toBeUndefined();
  });

  it('refuses a mechanic who is not the assignee', async () => {
    const queryBus = stubAccess({ roles: ['MECHANIC'], permissions: [] });
    const authorizer = new WorkOrderCompletionAuthorizer(queryBus.bus);

    await expect(
      authorizer.assertMayComplete(workOrder(OTHER_MECHANIC_ID), MECHANIC_ID),
    ).rejects.toThrow(CompletionForbiddenError);
  });

  it('refuses anyone lacking work-orders:manage on a work order with no assigned mechanic', async () => {
    const queryBus = stubAccess({ roles: ['MECHANIC'], permissions: [] });
    const authorizer = new WorkOrderCompletionAuthorizer(queryBus.bus);

    await expect(authorizer.assertMayComplete(workOrder(null), MECHANIC_ID)).rejects.toThrow(
      CompletionForbiddenError,
    );
  });

  it('refuses with a forbidden error, never a not-found one, unlike BudgetDecisionAuthorizer', async () => {
    const queryBus = stubAccess({ roles: ['MECHANIC'], permissions: [] });
    const authorizer = new WorkOrderCompletionAuthorizer(queryBus.bus);

    let thrown: unknown;
    try {
      await authorizer.assertMayComplete(workOrder(null), MECHANIC_ID);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(CompletionForbiddenError);
    expect(thrown).not.toBeInstanceOf(WorkOrderNotFoundError);
  });
});
