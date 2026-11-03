import { describe, expect, it, vi } from 'vitest';
import { CustomerQueryPort, CustomerSummaryDto } from '../../ports/customer-query.port';
import { ListCustomersUseCase } from './list-customers.use-case';
import { ListCustomersQuery } from './list-customers.query';

function fakePort(result: CustomerSummaryDto[] = []): CustomerQueryPort {
  return {
    getById: vi.fn(),
    getByUserId: vi.fn(),
    listActive: vi.fn().mockResolvedValue(result),
  };
}

describe('ListCustomersUseCase', () => {
  it('passes both filters through untouched when no document is supplied', async () => {
    const port = fakePort();
    const useCase = new ListCustomersUseCase(port);

    await useCase.execute(new ListCustomersQuery('Jane'));

    expect(port.listActive).toHaveBeenCalledWith({ name: 'Jane', document: undefined });
  });

  // The document is the user's: the query adapter hands it to the user search, which normalizes a
  // formatted one and finds nobody for a malformed one (find-users.use-case.spec.ts).
  it.each(['111.444.777-35', '123'])(
    'hands the document filter %s to the port exactly as typed',
    async (document) => {
      const port = fakePort();
      const useCase = new ListCustomersUseCase(port);

      await useCase.execute(new ListCustomersQuery(undefined, document));

      expect(port.listActive).toHaveBeenCalledWith({ name: undefined, document });
    },
  );

  it('returns exactly what the port answers', async () => {
    const rows = [{ id: '11111111-1111-4111-8111-111111111111' } as CustomerSummaryDto];
    const useCase = new ListCustomersUseCase(fakePort(rows));

    await expect(useCase.execute(new ListCustomersQuery())).resolves.toBe(rows);
  });
});
