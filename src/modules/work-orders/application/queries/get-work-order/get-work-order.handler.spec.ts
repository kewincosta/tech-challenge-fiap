import { describe, expect, it, vi } from 'vitest';
import { InvalidWorkOrderNumberError } from '../../../domain/errors/invalid-work-order-number.error';
import { WorkOrderNotFoundError } from '../../../domain/errors/work-order-not-found.error';
import { WorkOrderQueryPort, WorkOrderSummaryDto } from '../../ports/work-order-query.port';
import { GetWorkOrderHandler } from './get-work-order.handler';
import { GetWorkOrderQuery } from './get-work-order.query';

const NUMBER = 'A1B090-2026';

function workOrder(): WorkOrderSummaryDto {
  return { id: '44444444-4444-4444-8444-444444444444', number: NUMBER } as WorkOrderSummaryDto;
}

// Answers for `NUMBER` alone, so a use case that reads another number gets `null`.
function fakePort(result: WorkOrderSummaryDto | null): WorkOrderQueryPort {
  return {
    getByNumber: vi.fn((number: string) => Promise.resolve(number === NUMBER ? result : null)),
    listByStatus: vi.fn(),
    listByCustomerId: vi.fn(),
    listTrail: vi.fn(),
  };
}

describe('GetWorkOrderHandler', () => {
  it('returns the work order in full for the number the port holds it under', async () => {
    const handler = new GetWorkOrderHandler(fakePort(workOrder()));

    const result = await handler.execute(new GetWorkOrderQuery(NUMBER));

    expect(result).toEqual(workOrder());
  });

  it('refuses a well-formed number no work order carries with WorkOrderNotFoundError', async () => {
    const handler = new GetWorkOrderHandler(fakePort(workOrder()));

    await expect(handler.execute(new GetWorkOrderQuery('ZZZZZZ-2026'))).rejects.toThrow(
      WorkOrderNotFoundError,
    );
  });

  it('refuses a malformed number with InvalidWorkOrderNumberError, not the not-found error', async () => {
    const handler = new GetWorkOrderHandler(fakePort(workOrder()));

    await expect(handler.execute(new GetWorkOrderQuery('not-a-number'))).rejects.toThrow(
      InvalidWorkOrderNumberError,
    );
  });
});
