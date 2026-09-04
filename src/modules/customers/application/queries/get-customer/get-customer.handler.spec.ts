import { describe, expect, it, vi } from 'vitest';
import { CustomerQueryPort, CustomerSummaryDto } from '../../ports/customer-query.port';
import { GetCustomerHandler } from './get-customer.handler';
import { GetCustomerQuery } from './get-customer.query';

const CUSTOMER_ID = '11111111-1111-4111-8111-111111111111';

function customer(): CustomerSummaryDto {
  return {
    id: CUSTOMER_ID,
    userId: '22222222-2222-4222-8222-222222222222',
    name: 'Jane Doe',
    email: 'jane@example.com',
    document: '11144477735',
    address: null,
    phoneNumber: null,
    status: 'ACTIVE',
  };
}

function fakePort(result: CustomerSummaryDto | null): CustomerQueryPort {
  return {
    getById: vi.fn().mockResolvedValue(result),
    getByUserId: vi.fn(),
    listActive: vi.fn(),
  };
}

describe('GetCustomerHandler', () => {
  it('returns what the port answers for a well formed id', async () => {
    const port = fakePort(customer());
    const handler = new GetCustomerHandler(port);

    const result = await handler.execute(new GetCustomerQuery(CUSTOMER_ID));

    expect(result).toEqual(customer());
    expect(port.getById).toHaveBeenCalledWith(CUSTOMER_ID);
  });

  it('returns null for an id the port knows nothing about', async () => {
    const handler = new GetCustomerHandler(fakePort(null));

    await expect(handler.execute(new GetCustomerQuery(CUSTOMER_ID))).resolves.toBeNull();
  });

  it('returns null for a malformed id without touching the port - a uuid column would throw on it', async () => {
    const port = fakePort(customer());
    const handler = new GetCustomerHandler(port);

    await expect(handler.execute(new GetCustomerQuery('not-a-uuid'))).resolves.toBeNull();
    expect(port.getById).not.toHaveBeenCalled();
  });
});
