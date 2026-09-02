import { describe, expect, it, vi } from 'vitest';
import { stubQueryBus } from '../../../../../../test/support/fakes/bus.stubs';
import { CustomerSummaryDto } from '../../../../customers/application/ports/customer-query.port';
import { GetCustomerByUserIdQuery } from '../../../../customers/application/queries/get-customer-by-user-id/get-customer-by-user-id.query';
import { WorkOrderQueryPort, WorkOrderSummaryDto } from '../../ports/work-order-query.port';
import { GetMyWorkOrderHandler } from './get-my-work-order.handler';
import { GetMyWorkOrderQuery } from './get-my-work-order.query';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_CUSTOMER_ID = '33333333-3333-4333-8333-333333333333';
const NUMBER = 'A1B090-2026';

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

function workOrder(customerId: string): WorkOrderSummaryDto {
  return { id: '44444444-4444-4444-8444-444444444444', customerId } as WorkOrderSummaryDto;
}

/** Branches by query class - never assumes call order (design.md's own rule). */
function fakePort(result: WorkOrderSummaryDto | null): WorkOrderQueryPort {
  return {
    getByNumber: vi.fn().mockResolvedValue(result),
    listByStatus: vi.fn(),
    listByCustomerId: vi.fn(),
    listTrail: vi.fn(),
  };
}

function stubQueries(
  customerDto: CustomerSummaryDto | null,
): ReturnType<typeof stubQueryBus> {
  const queryBus = stubQueryBus();
  queryBus.execute.mockImplementation((query: unknown) => {
    if (query instanceof GetCustomerByUserIdQuery) {
      return Promise.resolve(customerDto);
    }
    return Promise.resolve(null);
  });
  return queryBus;
}

describe('GetMyWorkOrderHandler', () => {
  it('returns the work order in full when the customer owns it', async () => {
    const port = fakePort(workOrder(CUSTOMER_ID));
    const queryBus = stubQueries(customer(CUSTOMER_ID));
    const handler = new GetMyWorkOrderHandler(port, queryBus.bus);

    const result = await handler.execute(new GetMyWorkOrderQuery(USER_ID, NUMBER));

    expect(result).toEqual(workOrder(CUSTOMER_ID));
  });

  it('returns null when the work order belongs to another customer', async () => {
    const port = fakePort(workOrder(OTHER_CUSTOMER_ID));
    const queryBus = stubQueries(customer(CUSTOMER_ID));
    const handler = new GetMyWorkOrderHandler(port, queryBus.bus);

    const result = await handler.execute(new GetMyWorkOrderQuery(USER_ID, NUMBER));

    expect(result).toBeNull();
  });

  it('returns null when the acting user backs no customer record', async () => {
    const port = fakePort(workOrder(CUSTOMER_ID));
    const queryBus = stubQueries(null);
    const handler = new GetMyWorkOrderHandler(port, queryBus.bus);

    const result = await handler.execute(new GetMyWorkOrderQuery(USER_ID, NUMBER));

    expect(result).toBeNull();
  });

  it('returns null when no work order carries the number', async () => {
    const port = fakePort(null);
    const queryBus = stubQueries(customer(CUSTOMER_ID));
    const handler = new GetMyWorkOrderHandler(port, queryBus.bus);

    const result = await handler.execute(new GetMyWorkOrderQuery(USER_ID, NUMBER));

    expect(result).toBeNull();
  });

  it('answers the identical value for all three refusal causes', async () => {
    const ownedByOther = await new GetMyWorkOrderHandler(
      fakePort(workOrder(OTHER_CUSTOMER_ID)),
      stubQueries(customer(CUSTOMER_ID)).bus,
    ).execute(new GetMyWorkOrderQuery(USER_ID, NUMBER));
    const noCustomer = await new GetMyWorkOrderHandler(
      fakePort(workOrder(CUSTOMER_ID)),
      stubQueries(null).bus,
    ).execute(new GetMyWorkOrderQuery(USER_ID, NUMBER));
    const notFound = await new GetMyWorkOrderHandler(
      fakePort(null),
      stubQueries(customer(CUSTOMER_ID)).bus,
    ).execute(new GetMyWorkOrderQuery(USER_ID, NUMBER));

    expect(ownedByOther).toBe(null);
    expect(noCustomer).toBe(null);
    expect(notFound).toBe(null);
  });
});
