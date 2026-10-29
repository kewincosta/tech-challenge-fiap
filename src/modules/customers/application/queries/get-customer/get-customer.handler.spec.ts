import { describe, expect, it, vi } from 'vitest';
import { CustomerNotFoundError } from '../../../domain/errors/customer-not-found.error';
import { CustomerQueryPort, CustomerSummaryDto } from '../../ports/customer-query.port';
import { GetCustomerHandler } from './get-customer.handler';
import { GetCustomerQuery } from './get-customer.query';

const CUSTOMER_ID = '11111111-1111-4111-8111-111111111111';

function customer(status = 'ACTIVE'): CustomerSummaryDto {
  return {
    id: CUSTOMER_ID,
    userId: '22222222-2222-4222-8222-222222222222',
    name: 'Jane Doe',
    email: 'jane@example.com',
    document: '11144477735',
    address: null,
    phoneNumber: null,
    status,
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

  it('returns a deactivated customer with its status, so "deactivated" stays apart from "does not exist"', async () => {
    const handler = new GetCustomerHandler(fakePort(customer('INACTIVE')));

    const result = await handler.execute(new GetCustomerQuery(CUSTOMER_ID));

    expect(result).toMatchObject({ status: 'INACTIVE' });
  });

  it('refuses an id the port knows nothing about with the customer not-found error', async () => {
    const handler = new GetCustomerHandler(fakePort(null));

    await expect(handler.execute(new GetCustomerQuery(CUSTOMER_ID))).rejects.toThrow(
      CustomerNotFoundError,
    );
  });

  it('refuses a malformed id with the customer not-found error without touching the port - a uuid column would throw on it', async () => {
    const port = fakePort(customer());
    const handler = new GetCustomerHandler(port);

    await expect(handler.execute(new GetCustomerQuery('not-a-uuid'))).rejects.toThrow(
      CustomerNotFoundError,
    );
    expect(port.getById).not.toHaveBeenCalled();
  });
});
