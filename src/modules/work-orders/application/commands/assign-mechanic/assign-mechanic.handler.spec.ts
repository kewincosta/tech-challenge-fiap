import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { FakeWorkOrderActors } from '../../../../../../test/support/fakes/fake-work-order-actors';
import { InMemoryWorkOrderRepository } from '../../../../../../test/support/fakes/in-memory-work-order.repository';
import { RecordingDomainEventPublisher } from '../../../../../../test/support/fakes/recording-domain-event-publisher';
import { WorkOrder } from '../../../domain/entities/work-order';
import { AssignedMechanicNotFoundError } from '../../../domain/errors/assigned-mechanic-not-found.error';
import { AssignedUserNotMechanicError } from '../../../domain/errors/assigned-user-not-mechanic.error';
import { WorkOrderNotFoundError } from '../../../domain/errors/work-order-not-found.error';
import { MechanicAssigned } from '../../../domain/events/mechanic-assigned.event';
import { WorkOrderId } from '../../../domain/value-objects/work-order-id';
import { WorkOrderNumber } from '../../../domain/value-objects/work-order-number';
import { AssignMechanicCommand } from './assign-mechanic.command';
import { AssignMechanicHandler } from './assign-mechanic.handler';

const CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';
const VEHICLE_ID = '33333333-3333-4333-8333-333333333333';
const CREATOR_ID = '44444444-4444-4444-8444-444444444444';
const MECHANIC_ID = '55555555-5555-4555-8555-555555555555';
const NUMBER = 'A1B090-2026';

function buildWorkOrder(): WorkOrder {
  const workOrder = WorkOrder.open({
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
  // A work order read back from the repository carries no pending events.
  workOrder.pullDomainEvents();
  return workOrder;
}

/** `null` leaves the user out of the fake, so identity does not know them. */
function makeHandler(candidate: { isMechanic: boolean } | null) {
  const workOrders = new InMemoryWorkOrderRepository();
  const actors = new FakeWorkOrderActors();
  if (candidate) {
    actors.withUser(MECHANIC_ID, candidate.isMechanic);
  }
  const clock = new FakeClock();
  const events = new RecordingDomainEventPublisher();
  const handler = new AssignMechanicHandler(workOrders, clock, actors, events);
  return { handler, workOrders, clock, events };
}

describe('AssignMechanicHandler', () => {
  it('should assign a user who holds MECHANIC and record the assignment', async () => {
    const { handler, workOrders } = makeHandler({ isMechanic: true });
    await workOrders.save(buildWorkOrder());

    await handler.execute(new AssignMechanicCommand(NUMBER, MECHANIC_ID, CREATOR_ID));

    expect(workOrders.workOrders[0].assignedMechanicUserId).toBe(MECHANIC_ID);
  });

  it('should publish the mechanic-assigned event of the work order, with the acting user', async () => {
    const { handler, workOrders, clock, events } = makeHandler({ isMechanic: true });
    await workOrders.save(buildWorkOrder());

    await handler.execute(new AssignMechanicCommand(NUMBER, MECHANIC_ID, CREATOR_ID));

    expect(events.published).toEqual([
      new MechanicAssigned(workOrders.workOrders[0].id.value, CREATOR_ID, clock.now()),
    ]);
  });

  it('should refuse a user who exists without the role, with AssignedUserNotMechanicError', async () => {
    const { handler, workOrders, events } = makeHandler({ isMechanic: false });
    await workOrders.save(buildWorkOrder());

    await expect(
      handler.execute(new AssignMechanicCommand(NUMBER, MECHANIC_ID, CREATOR_ID)),
    ).rejects.toThrow(AssignedUserNotMechanicError);
    expect(workOrders.workOrders[0].assignedMechanicUserId).toBeNull();
    expect(events.published).toHaveLength(0);
  });

  it('should refuse a user that does not exist with AssignedMechanicNotFoundError', async () => {
    const { handler, workOrders, events } = makeHandler(null);
    await workOrders.save(buildWorkOrder());

    await expect(
      handler.execute(new AssignMechanicCommand(NUMBER, MECHANIC_ID, CREATOR_ID)),
    ).rejects.toThrow(AssignedMechanicNotFoundError);
    expect(workOrders.workOrders[0].assignedMechanicUserId).toBeNull();
    expect(events.published).toHaveLength(0);
  });

  it('should replace an existing assignee', async () => {
    const { handler, workOrders } = makeHandler({ isMechanic: true });
    const workOrder = buildWorkOrder();
    workOrder.assignMechanic({
      mechanicUserId: '66666666-6666-4666-8666-666666666666',
      actorUserId: CREATOR_ID,
      now: new Date(),
    });
    workOrder.pullDomainEvents();
    await workOrders.save(workOrder);

    await handler.execute(new AssignMechanicCommand(NUMBER, MECHANIC_ID, CREATOR_ID));

    expect(workOrders.workOrders[0].assignedMechanicUserId).toBe(MECHANIC_ID);
  });

  it('should refuse an unknown work order with WorkOrderNotFoundError', async () => {
    const { handler, events } = makeHandler({ isMechanic: true });

    await expect(
      handler.execute(new AssignMechanicCommand('ZZZZZZ-2026', MECHANIC_ID, CREATOR_ID)),
    ).rejects.toThrow(WorkOrderNotFoundError);
    expect(events.published).toHaveLength(0);
  });
});
