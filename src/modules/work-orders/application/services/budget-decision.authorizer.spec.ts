import { describe, expect, it } from 'vitest';
import { stubQueryBus } from '../../../../../test/support/fakes/bus.stubs';
import { EffectiveAccessDto } from '../../../authorization/application/dtos/effective-access.dto';
import { GetUserEffectiveAccessQuery } from '../../../authorization/application/queries/get-user-effective-access/get-user-effective-access.query';
import { CustomerSummaryDto } from '../../../customers/application/ports/customer-query.port';
import { GetCustomerByUserIdQuery } from '../../../customers/application/queries/get-customer-by-user-id/get-customer-by-user-id.query';
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

function customer(id: string): CustomerSummaryDto {
  return {
    id,
    userId: ACTOR_ID,
    name: 'Jane Doe',
    email: 'jane@example.com',
    document: '12345678900',
    address: null,
    phoneNumber: null,
    status: 'ACTIVE',
  };
}

/** Branches by query class - never assumes call order (T13's own rule). */
function stubQueries(
  access: EffectiveAccessDto,
  customerDto: CustomerSummaryDto | null,
): ReturnType<typeof stubQueryBus> {
  const queryBus = stubQueryBus();
  queryBus.execute.mockImplementation((query: unknown) => {
    if (query instanceof GetUserEffectiveAccessQuery) {
      return Promise.resolve(access);
    }
    if (query instanceof GetCustomerByUserIdQuery) {
      return Promise.resolve(customerDto);
    }
    return Promise.resolve(null);
  });
  return queryBus;
}

describe('BudgetDecisionAuthorizer', () => {
  it('admits an actor holding work-orders:decide, without ever reading their customer', async () => {
    const queryBus = stubQueries({ roles: ['SERVICE_ADVISOR'], permissions: ['work-orders:decide'] }, null);
    const authorizer = new BudgetDecisionAuthorizer(queryBus.bus);

    await expect(authorizer.assertMayDecide(workOrder(), ACTOR_ID)).resolves.toBeUndefined();
    expect(queryBus.execute).not.toHaveBeenCalledWith(expect.any(GetCustomerByUserIdQuery));
  });

  it("admits the actor whose customer's external id equals the work order's customerId", async () => {
    const queryBus = stubQueries({ roles: ['CUSTOMER'], permissions: [] }, customer(CUSTOMER_ID));
    const authorizer = new BudgetDecisionAuthorizer(queryBus.bus);

    await expect(authorizer.assertMayDecide(workOrder(), ACTOR_ID)).resolves.toBeUndefined();
  });

  it('refuses a customer who owns a different work order with WorkOrderNotFoundError, not a forbidden error', async () => {
    const otherCustomerId = '66666666-6666-4666-8666-666666666666';
    const queryBus = stubQueries({ roles: ['CUSTOMER'], permissions: [] }, customer(otherCustomerId));
    const authorizer = new BudgetDecisionAuthorizer(queryBus.bus);

    await expect(authorizer.assertMayDecide(workOrder(), ACTOR_ID)).rejects.toThrow(
      WorkOrderNotFoundError,
    );
  });

  it('refuses an actor holding neither the permission nor any customer record, the same way', async () => {
    const queryBus = stubQueries({ roles: [], permissions: [] }, null);
    const authorizer = new BudgetDecisionAuthorizer(queryBus.bus);

    await expect(authorizer.assertMayDecide(workOrder(), ACTOR_ID)).rejects.toThrow(
      WorkOrderNotFoundError,
    );
  });
});
