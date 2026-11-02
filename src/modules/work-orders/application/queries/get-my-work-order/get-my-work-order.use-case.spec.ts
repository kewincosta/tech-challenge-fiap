import { describe, expect, it, vi } from 'vitest';
import { FakeCustomerDirectory } from '../../../../../../test/support/fakes/fake-customer-directory';
import { InvalidWorkOrderNumberError } from '../../../domain/errors/invalid-work-order-number.error';
import { WorkOrderNotFoundError } from '../../../domain/errors/work-order-not-found.error';
import { WorkOrderQueryPort, WorkOrderSummaryDto } from '../../ports/work-order-query.port';
import { GetMyWorkOrderUseCase } from './get-my-work-order.use-case';
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

// Answers for `NUMBER` alone, so a use case that reads another number gets `null`.
function fakePort(result: WorkOrderSummaryDto | null): WorkOrderQueryPort {
  return {
    getByNumber: vi.fn((number: string) => Promise.resolve(number === NUMBER ? result : null)),
    listBoard: vi.fn(),
    listByCustomerId: vi.fn(),
    listTrail: vi.fn(),
  };
}

/** The error the use case refuses with, whatever the cause. */
async function refusalOf(
  port: WorkOrderQueryPort,
  customers: FakeCustomerDirectory,
): Promise<unknown> {
  try {
    await new GetMyWorkOrderUseCase(port, customers).execute(
      new GetMyWorkOrderQuery(USER_ID, NUMBER),
    );
  } catch (error) {
    return error;
  }
  throw new Error('The use case answered instead of refusing.');
}

describe('GetMyWorkOrderUseCase', () => {
  it('returns the work order in full when the customer owns it', async () => {
    const port = fakePort(workOrder(CUSTOMER_ID));
    const useCase = new GetMyWorkOrderUseCase(port, directoryOf(CUSTOMER_ID));

    const result = await useCase.execute(new GetMyWorkOrderQuery(USER_ID, NUMBER));

    expect(result).toEqual(workOrder(CUSTOMER_ID));
  });

  it('refuses a work order that belongs to another customer with WorkOrderNotFoundError', async () => {
    const port = fakePort(workOrder(OTHER_CUSTOMER_ID));
    const useCase = new GetMyWorkOrderUseCase(port, directoryOf(CUSTOMER_ID));

    await expect(useCase.execute(new GetMyWorkOrderQuery(USER_ID, NUMBER))).rejects.toThrow(
      WorkOrderNotFoundError,
    );
  });

  it('refuses an acting user who backs no customer record with WorkOrderNotFoundError', async () => {
    const port = fakePort(workOrder(CUSTOMER_ID));
    const useCase = new GetMyWorkOrderUseCase(port, directoryOf(null));

    await expect(useCase.execute(new GetMyWorkOrderQuery(USER_ID, NUMBER))).rejects.toThrow(
      WorkOrderNotFoundError,
    );
  });

  it('refuses a number no work order carries with WorkOrderNotFoundError', async () => {
    const port = fakePort(null);
    const useCase = new GetMyWorkOrderUseCase(port, directoryOf(CUSTOMER_ID));

    await expect(useCase.execute(new GetMyWorkOrderQuery(USER_ID, NUMBER))).rejects.toThrow(
      WorkOrderNotFoundError,
    );
  });

  it('answers the identical error for all three refusal causes', async () => {
    const ownedByOther = await refusalOf(
      fakePort(workOrder(OTHER_CUSTOMER_ID)),
      directoryOf(CUSTOMER_ID),
    );
    const noCustomer = await refusalOf(fakePort(workOrder(CUSTOMER_ID)), directoryOf(null));
    const notFound = await refusalOf(fakePort(null), directoryOf(CUSTOMER_ID));

    expect(ownedByOther).toBeInstanceOf(WorkOrderNotFoundError);
    expect(noCustomer).toEqual(ownedByOther);
    expect(notFound).toEqual(ownedByOther);
  });

  it('refuses a malformed number with InvalidWorkOrderNumberError, not the not-found error', async () => {
    const port = fakePort(workOrder(CUSTOMER_ID));
    const useCase = new GetMyWorkOrderUseCase(port, directoryOf(CUSTOMER_ID));

    await expect(useCase.execute(new GetMyWorkOrderQuery(USER_ID, 'not-a-number'))).rejects.toThrow(
      InvalidWorkOrderNumberError,
    );
  });
});
