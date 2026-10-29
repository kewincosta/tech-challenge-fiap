import { describe, expect, it, vi } from 'vitest';
import { CustomerNotFoundError } from '../../../domain/errors/customer-not-found.error';
import { CustomerQueryPort, CustomerSummaryDto } from '../../ports/customer-query.port';
import { GetCustomerByUserIdUseCase } from './get-customer-by-user-id.use-case';
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

describe('GetCustomerByUserIdUseCase', () => {
  it("returns the customer record backing the user, read by the user's own id", async () => {
    const port = fakePort(customer());
    const useCase = new GetCustomerByUserIdUseCase(port);

    const result = await useCase.execute(new GetCustomerByUserIdQuery(USER_ID));

    expect(result).toEqual(customer());
    expect(port.getByUserId).toHaveBeenCalledWith(USER_ID);
  });

  it('refuses a user with no customer record with the customer not-found error', async () => {
    const useCase = new GetCustomerByUserIdUseCase(fakePort(null));

    await expect(useCase.execute(new GetCustomerByUserIdQuery(USER_ID))).rejects.toThrow(
      CustomerNotFoundError,
    );
  });

  it('passes a malformed id straight through - every caller supplies a verified JWT subject', async () => {
    const port = fakePort(customer());
    const useCase = new GetCustomerByUserIdUseCase(port);

    await useCase.execute(new GetCustomerByUserIdQuery('not-a-uuid'));

    expect(port.getByUserId).toHaveBeenCalledWith('not-a-uuid');
  });
});
