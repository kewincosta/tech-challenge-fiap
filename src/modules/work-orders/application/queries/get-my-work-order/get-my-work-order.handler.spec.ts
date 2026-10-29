import { describe, expect, it, vi } from 'vitest';
import { FakeCustomerDirectory } from '../../../../../../test/support/fakes/fake-customer-directory';
import { WorkOrderQueryPort, WorkOrderSummaryDto } from '../../ports/work-order-query.port';
import { GetMyWorkOrderHandler } from './get-my-work-order.handler';
import { GetMyWorkOrderQuery } from './get-my-work-order.query';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_CUSTOMER_ID = '33333333-3333-4333-8333-333333333333';
const NUMBER = 'A1B090-2026';

/** The user backs the customer `customerId`, or backs none when `null`. */
function directoryOf(customerId: string | null): FakeCustomerDirectory {
  const customers = new FakeCustomerDirectory();
  if (customerId) {
    customers.add({ id: customerId, name: 'Jane Doe', active: true }, USER_ID);
  }
  return customers;
}

function workOrder(customerId: string): WorkOrderSummaryDto {
  return { id: '44444444-4444-4444-8444-444444444444', customerId } as WorkOrderSummaryDto;
}

// Answers for `NUMBER` alone, so a handler that reads another number gets `null`.
function fakePort(result: WorkOrderSummaryDto | null): WorkOrderQueryPort {
  return {
    getByNumber: vi.fn((number: string) => Promise.resolve(number === NUMBER ? result : null)),
    listByStatus: vi.fn(),
    listByCustomerId: vi.fn(),
    listTrail: vi.fn(),
  };
}

describe('GetMyWorkOrderHandler', () => {
  it('returns the work order in full when the customer owns it', async () => {
    const port = fakePort(workOrder(CUSTOMER_ID));
    const handler = new GetMyWorkOrderHandler(port, directoryOf(CUSTOMER_ID));

    const result = await handler.execute(new GetMyWorkOrderQuery(USER_ID, NUMBER));

    expect(result).toEqual(workOrder(CUSTOMER_ID));
  });

  it('returns null when the work order belongs to another customer', async () => {
    const port = fakePort(workOrder(OTHER_CUSTOMER_ID));
    const handler = new GetMyWorkOrderHandler(port, directoryOf(CUSTOMER_ID));

    const result = await handler.execute(new GetMyWorkOrderQuery(USER_ID, NUMBER));

    expect(result).toBeNull();
  });

  it('returns null when the acting user backs no customer record', async () => {
    const port = fakePort(workOrder(CUSTOMER_ID));
    const handler = new GetMyWorkOrderHandler(port, directoryOf(null));

    const result = await handler.execute(new GetMyWorkOrderQuery(USER_ID, NUMBER));

    expect(result).toBeNull();
  });

  it('returns null when no work order carries the number', async () => {
    const port = fakePort(null);
    const handler = new GetMyWorkOrderHandler(port, directoryOf(CUSTOMER_ID));

    const result = await handler.execute(new GetMyWorkOrderQuery(USER_ID, NUMBER));

    expect(result).toBeNull();
  });

  it('answers the identical value for all three refusal causes', async () => {
    const ownedByOther = await new GetMyWorkOrderHandler(
      fakePort(workOrder(OTHER_CUSTOMER_ID)),
      directoryOf(CUSTOMER_ID),
    ).execute(new GetMyWorkOrderQuery(USER_ID, NUMBER));
    const noCustomer = await new GetMyWorkOrderHandler(
      fakePort(workOrder(CUSTOMER_ID)),
      directoryOf(null),
    ).execute(new GetMyWorkOrderQuery(USER_ID, NUMBER));
    const notFound = await new GetMyWorkOrderHandler(
      fakePort(null),
      directoryOf(CUSTOMER_ID),
    ).execute(new GetMyWorkOrderQuery(USER_ID, NUMBER));

    expect(ownedByOther).toBe(null);
    expect(noCustomer).toBe(null);
    expect(notFound).toBe(null);
  });
});
