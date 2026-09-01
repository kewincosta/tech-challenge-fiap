import { describe, expect, it } from 'vitest';
import { stubEventBus, stubQueryBus } from '../../../../../../test/support/fakes/bus.stubs';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { InMemoryWorkOrderRepository } from '../../../../../../test/support/fakes/in-memory-work-order.repository';
import { EffectiveAccessDto } from '../../../../authorization/application/dtos/effective-access.dto';
import { GetUserEffectiveAccessQuery } from '../../../../authorization/application/queries/get-user-effective-access/get-user-effective-access.query';
import { UserDto } from '../../../../users/application/dtos/user.dto';
import { GetUserByIdQuery } from '../../../../users/application/queries/get-user-by-id/get-user-by-id.query';
import { WorkOrder } from '../../../domain/entities/work-order';
import { AssignedMechanicNotFoundError } from '../../../domain/errors/assigned-mechanic-not-found.error';
import { AssignedUserNotMechanicError } from '../../../domain/errors/assigned-user-not-mechanic.error';
import { WorkOrderNotFoundError } from '../../../domain/errors/work-order-not-found.error';
import { WorkOrderId } from '../../../domain/value-objects/work-order-id';
import { WorkOrderNumber } from '../../../domain/value-objects/work-order-number';
import { AssignMechanicCommand } from './assign-mechanic.command';
import { AssignMechanicHandler } from './assign-mechanic.handler';

const CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';
const VEHICLE_ID = '33333333-3333-4333-8333-333333333333';
const CREATOR_ID = '44444444-4444-4444-8444-444444444444';
const MECHANIC_ID = '55555555-5555-4555-8555-555555555555';
const NUMBER = 'A1B090-2026';

const MECHANIC_USER: UserDto = {
  id: MECHANIC_ID,
  email: 'mechanic@example.com',
  name: 'Bob Mechanic',
  status: 'ACTIVE',
  mustChangePassword: false,
  createdAt: new Date().toISOString(),
};

/** Branches by query class, per design.md's Risks & Concerns - never assumes call order. */
function stubQueries(
  user: UserDto | null,
  access: EffectiveAccessDto,
): ReturnType<typeof stubQueryBus> {
  const queryBus = stubQueryBus();
  queryBus.execute.mockImplementation((query: unknown) => {
    if (query instanceof GetUserByIdQuery) {
      return Promise.resolve(user);
    }
    if (query instanceof GetUserEffectiveAccessQuery) {
      return Promise.resolve(access);
    }
    return Promise.resolve(null);
  });
  return queryBus;
}

function buildWorkOrder(): WorkOrder {
  return WorkOrder.open({
    id: WorkOrderId.create('11111111-1111-4111-8111-111111111111'),
    number: WorkOrderNumber.create(NUMBER),
    customerId: CUSTOMER_ID,
    vehicleId: VEHICLE_ID,
    createdByUserId: CREATOR_ID,
    customerName: 'Jane Doe',
    vehiclePlate: 'ABC1234',
    vehicleBrand: 'Toyota',
    vehicleModel: 'Corolla',
    vehicleYear: 2020,
    now: new Date('2026-08-31T12:00:00.000Z'),
  });
}

function makeHandler(user: UserDto | null, access: EffectiveAccessDto) {
  const workOrders = new InMemoryWorkOrderRepository();
  const queryBus = stubQueries(user, access);
  const eventBus = stubEventBus();
  const handler = new AssignMechanicHandler(
    workOrders,
    new FakeClock(),
    queryBus.bus,
    eventBus.bus,
  );
  return { handler, workOrders };
}

describe('AssignMechanicHandler', () => {
  it('should assign a user who holds MECHANIC and record the assignment', async () => {
    const { handler, workOrders } = makeHandler(MECHANIC_USER, {
      roles: ['MECHANIC'],
      permissions: [],
    });
    await workOrders.save(buildWorkOrder());

    await handler.execute(new AssignMechanicCommand(NUMBER, MECHANIC_ID, CREATOR_ID));

    expect(workOrders.workOrders[0].assignedMechanicUserId).toBe(MECHANIC_ID);
  });

  it('should refuse a user who exists without the role, with AssignedUserNotMechanicError', async () => {
    const { handler, workOrders } = makeHandler(MECHANIC_USER, {
      roles: ['SERVICE_ADVISOR'],
      permissions: [],
    });
    await workOrders.save(buildWorkOrder());

    await expect(
      handler.execute(new AssignMechanicCommand(NUMBER, MECHANIC_ID, CREATOR_ID)),
    ).rejects.toThrow(AssignedUserNotMechanicError);
    expect(workOrders.workOrders[0].assignedMechanicUserId).toBeNull();
  });

  it('should refuse a user that does not exist with AssignedMechanicNotFoundError, proving the existence read runs first', async () => {
    const { handler, workOrders } = makeHandler(null, { roles: [], permissions: [] });
    await workOrders.save(buildWorkOrder());

    await expect(
      handler.execute(new AssignMechanicCommand(NUMBER, MECHANIC_ID, CREATOR_ID)),
    ).rejects.toThrow(AssignedMechanicNotFoundError);
    expect(workOrders.workOrders[0].assignedMechanicUserId).toBeNull();
  });

  it('should replace an existing assignee', async () => {
    const { handler, workOrders } = makeHandler(MECHANIC_USER, {
      roles: ['MECHANIC'],
      permissions: [],
    });
    const workOrder = buildWorkOrder();
    workOrder.assignMechanic({
      mechanicUserId: '66666666-6666-4666-8666-666666666666',
      actorUserId: CREATOR_ID,
      now: new Date(),
    });
    await workOrders.save(workOrder);

    await handler.execute(new AssignMechanicCommand(NUMBER, MECHANIC_ID, CREATOR_ID));

    expect(workOrders.workOrders[0].assignedMechanicUserId).toBe(MECHANIC_ID);
  });

  it('should refuse an unknown work order with WorkOrderNotFoundError', async () => {
    const { handler } = makeHandler(MECHANIC_USER, { roles: ['MECHANIC'], permissions: [] });

    await expect(
      handler.execute(new AssignMechanicCommand('ZZZZZZ-2026', MECHANIC_ID, CREATOR_ID)),
    ).rejects.toThrow(WorkOrderNotFoundError);
  });
});
