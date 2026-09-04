import { describe, expect, it, vi } from 'vitest';
import { CustomerQueryPort, CustomerSummaryDto } from '../../ports/customer-query.port';
import { ListCustomersHandler } from './list-customers.handler';
import { ListCustomersQuery } from './list-customers.query';

function fakePort(result: CustomerSummaryDto[] = []): CustomerQueryPort {
  return {
    getById: vi.fn(),
    getByUserId: vi.fn(),
    listActive: vi.fn().mockResolvedValue(result),
  };
}

describe('ListCustomersHandler', () => {
  it('passes both filters through untouched when no document is supplied', async () => {
    const port = fakePort();
    const handler = new ListCustomersHandler(port);

    await handler.execute(new ListCustomersQuery('Jane'));

    expect(port.listActive).toHaveBeenCalledWith({ name: 'Jane', document: undefined });
  });

  it('normalises a formatted CPF to its digits before filtering', async () => {
    const port = fakePort();
    const handler = new ListCustomersHandler(port);

    await handler.execute(new ListCustomersQuery(undefined, '111.444.777-35'));

    expect(port.listActive).toHaveBeenCalledWith({ name: undefined, document: '11144477735' });
  });

  it('answers an empty list for a malformed document filter, never an error', async () => {
    const port = fakePort([{ id: 'x' } as CustomerSummaryDto]);
    const handler = new ListCustomersHandler(port);

    const result = await handler.execute(new ListCustomersQuery(undefined, '123'));

    expect(result).toEqual([]);
    expect(port.listActive).not.toHaveBeenCalled();
  });

  it('returns exactly what the port answers', async () => {
    const rows = [{ id: '11111111-1111-4111-8111-111111111111' } as CustomerSummaryDto];
    const handler = new ListCustomersHandler(fakePort(rows));

    await expect(handler.execute(new ListCustomersQuery())).resolves.toBe(rows);
  });
});
