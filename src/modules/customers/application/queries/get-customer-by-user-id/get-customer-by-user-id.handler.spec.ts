import { describe, expect, it, vi } from 'vitest';
import { CustomerQueryPort, CustomerSummaryDto } from '../../ports/customer-query.port';
import { GetCustomerByUserIdHandler } from './get-customer-by-user-id.handler';
import { GetCustomerByUserIdQuery } from './get-customer-by-user-id.query';

const USER_ID = '22222222-2222-4222-8222-222222222222';

function customer(): CustomerSummaryDto {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    userId: USER_ID,
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
    getById: vi.fn(),
    getByUserId: vi.fn().mockResolvedValue(result),
    listActive: vi.fn(),
  };
}

describe('GetCustomerByUserIdHandler', () => {
  it("returns the customer record backing the user, read by the user's own id", async () => {
    const port = fakePort(customer());
    const handler = new GetCustomerByUserIdHandler(port);

    const result = await handler.execute(new GetCustomerByUserIdQuery(USER_ID));

    expect(result).toEqual(customer());
    expect(port.getByUserId).toHaveBeenCalledWith(USER_ID);
  });

  it('returns null for a user with no customer record, not an error', async () => {
    const handler = new GetCustomerByUserIdHandler(fakePort(null));

    await expect(
      handler.execute(new GetCustomerByUserIdQuery(USER_ID)),
    ).resolves.toBeNull();
  });

  it('passes a malformed id straight through - every caller supplies a verified JWT subject', async () => {
    const port = fakePort(null);
    const handler = new GetCustomerByUserIdHandler(port);

    await handler.execute(new GetCustomerByUserIdQuery('not-a-uuid'));

    expect(port.getByUserId).toHaveBeenCalledWith('not-a-uuid');
  });
});
