import { describe, expect, it } from 'vitest';
import { FakeCustomerDirectory } from '../../../../../test/support/fakes/fake-customer-directory';
import { FakeWorkOrderActors } from '../../../../../test/support/fakes/fake-work-order-actors';
import { WorkOrder } from '../../domain/entities/work-order';
import { WorkOrderNotFoundError } from '../../domain/errors/work-order-not-found.error';
import { WorkOrderId } from '../../domain/value-objects/work-order-id';
import { WorkOrderNumber } from '../../domain/value-objects/work-order-number';
import { BudgetDecisionAuthorizer } from './budget-decision.authorizer';

const CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';
const VEHICLE_ID = '33333333-3333-4333-8333-333333333333';
const CREATOR_ID = '44444444-4444-4444-8444-444444444444';
const ACTOR_ID = '55555555-5555-4555-8555-555555555555';

function workOrder(): WorkOrder {
  return WorkOrder.open({
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
}

function makeAuthorizer(
  actors: FakeWorkOrderActors,
  customerOfActor: string | null,
): { authorizer: BudgetDecisionAuthorizer; customers: FakeCustomerDirectory } {
  const customers = new FakeCustomerDirectory();
  if (customerOfActor) {
    customers.add({ id: customerOfActor, name: 'Jane Doe', active: true }, ACTOR_ID);
  }
  return { authorizer: new BudgetDecisionAuthorizer(actors, customers), customers };
}

describe('BudgetDecisionAuthorizer', () => {
  it('admits an actor who decides any budget, without ever reading their customer', async () => {
    const actors = new FakeWorkOrderActors().withCapabilities(ACTOR_ID, { decidesAnyBudget: true });
    const { authorizer, customers } = makeAuthorizer(actors, null);

    await expect(authorizer.assertMayDecide(workOrder(), ACTOR_ID)).resolves.toBeUndefined();
    expect(customers.userLookups).toEqual([]);
  });

  it("admits the actor whose customer's external id equals the work order's customerId", async () => {
    const { authorizer } = makeAuthorizer(new FakeWorkOrderActors(), CUSTOMER_ID);

    await expect(authorizer.assertMayDecide(workOrder(), ACTOR_ID)).resolves.toBeUndefined();
  });

  it('refuses a customer who owns a different work order with WorkOrderNotFoundError, not a forbidden error', async () => {
    const otherCustomerId = '66666666-6666-4666-8666-666666666666';
    const { authorizer } = makeAuthorizer(new FakeWorkOrderActors(), otherCustomerId);

    await expect(authorizer.assertMayDecide(workOrder(), ACTOR_ID)).rejects.toThrow(
      WorkOrderNotFoundError,
    );
  });

  it('refuses an actor holding neither the capability nor any customer record, the same way', async () => {
    const { authorizer } = makeAuthorizer(new FakeWorkOrderActors(), null);

    await expect(authorizer.assertMayDecide(workOrder(), ACTOR_ID)).rejects.toThrow(
      WorkOrderNotFoundError,
    );
  });
});
