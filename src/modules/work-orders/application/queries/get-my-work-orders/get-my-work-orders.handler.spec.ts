import { describe, expect, it, vi } from 'vitest';
import { stubQueryBus } from '../../../../../../test/support/fakes/bus.stubs';
import { CustomerSummaryDto } from '../../../../customers/application/ports/customer-query.port';
import { GetCustomerByUserIdQuery } from '../../../../customers/application/queries/get-customer-by-user-id/get-customer-by-user-id.query';
import { WorkOrderQueryPort, WorkOrderSummaryDto } from '../../ports/work-order-query.port';
import { GetMyWorkOrdersHandler } from './get-my-work-orders.handler';
import { GetMyWorkOrdersQuery } from './get-my-work-orders.query';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';

function customer(id: string): CustomerSummaryDto {
  return {
    id,
    userId: USER_ID,
    name: 'Jane Doe',
    email: 'jane@example.com',
    document: '12345678900',
    address: null,
    phoneNumber: null,
    status: 'ACTIVE',
  };
}

function fakePort(result: WorkOrderSummaryDto[]): WorkOrderQueryPort {
  return {
    getByNumber: vi.fn(),
    listByStatus: vi.fn(),
    listByCustomerId: vi.fn().mockResolvedValue(result),
    listTrail: vi.fn(),
  };
}

describe('GetMyWorkOrdersHandler', () => {
  it("resolves the customer over the QueryBus, never by importing the customers module's repository", async () => {
    const workOrderQuery = fakePort([]);
    const queryBus = stubQueryBus();
    queryBus.execute.mockImplementation((query: unknown) => {
      if (query instanceof GetCustomerByUserIdQuery) {
        return Promise.resolve(customer(CUSTOMER_ID));
      }
      return Promise.resolve(null);
    });
    const handler = new GetMyWorkOrdersHandler(workOrderQuery, queryBus.bus);

    await handler.execute(new GetMyWorkOrdersQuery(USER_ID));

    expect(queryBus.execute).toHaveBeenCalledWith(expect.any(GetCustomerByUserIdQuery));
  });

  it('returns an empty list for a user backing no customer record, not an error', async () => {
    const workOrderQuery = fakePort([]);
    const queryBus = stubQueryBus();
    queryBus.execute.mockResolvedValue(null);
    const handler = new GetMyWorkOrdersHandler(workOrderQuery, queryBus.bus);

    const result = await handler.execute(new GetMyWorkOrdersQuery(USER_ID));

    expect(result).toEqual([]);
    expect(workOrderQuery.listByCustomerId).not.toHaveBeenCalled();
  });

  it("returns exactly what listByCustomerId answers for the resolved customer's id", async () => {
    const workOrders = [{ id: '33333333-3333-4333-8333-333333333333' } as WorkOrderSummaryDto];
    const workOrderQuery = fakePort(workOrders);
    const queryBus = stubQueryBus();
    queryBus.execute.mockResolvedValue(customer(CUSTOMER_ID));
    const handler = new GetMyWorkOrdersHandler(workOrderQuery, queryBus.bus);

    const result = await handler.execute(new GetMyWorkOrdersQuery(USER_ID));

    expect(result).toBe(workOrders);
    expect(workOrderQuery.listByCustomerId).toHaveBeenCalledWith(CUSTOMER_ID);
  });
});
