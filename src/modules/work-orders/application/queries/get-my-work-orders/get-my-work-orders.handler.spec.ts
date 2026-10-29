import { describe, expect, it, vi } from 'vitest';
import { FakeCustomerDirectory } from '../../../../../../test/support/fakes/fake-customer-directory';
import { WorkOrderQueryPort, WorkOrderSummaryDto } from '../../ports/work-order-query.port';
import { GetMyWorkOrdersHandler } from './get-my-work-orders.handler';
import { GetMyWorkOrdersQuery } from './get-my-work-orders.query';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';

/** The user backs the customer `customerId`, or backs none when `null`. */
function directoryOf(customerId: string | null): FakeCustomerDirectory {
  const customers = new FakeCustomerDirectory();
  if (customerId) {
    customers.add({ id: customerId, name: 'Jane Doe', active: true }, USER_ID);
  }
  return customers;
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
  it("resolves the customer through the customer directory, by the caller's user id", async () => {
    const workOrderQuery = fakePort([]);
    const customers = directoryOf(CUSTOMER_ID);
    const handler = new GetMyWorkOrdersHandler(workOrderQuery, customers);

    await handler.execute(new GetMyWorkOrdersQuery(USER_ID));

    expect(customers.userLookups).toEqual([USER_ID]);
  });

  it('returns an empty list for a user backing no customer record, not an error', async () => {
    const workOrderQuery = fakePort([]);
    const handler = new GetMyWorkOrdersHandler(workOrderQuery, directoryOf(null));

    const result = await handler.execute(new GetMyWorkOrdersQuery(USER_ID));

    expect(result).toEqual([]);
    expect(workOrderQuery.listByCustomerId).not.toHaveBeenCalled();
  });

  it("returns exactly what listByCustomerId answers for the resolved customer's id", async () => {
    const workOrders = [{ id: '33333333-3333-4333-8333-333333333333' } as WorkOrderSummaryDto];
    const workOrderQuery = fakePort(workOrders);
    const handler = new GetMyWorkOrdersHandler(workOrderQuery, directoryOf(CUSTOMER_ID));

    const result = await handler.execute(new GetMyWorkOrdersQuery(USER_ID));

    expect(result).toBe(workOrders);
    expect(workOrderQuery.listByCustomerId).toHaveBeenCalledWith(CUSTOMER_ID);
  });
});
