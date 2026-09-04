import { describe, expect, it, vi } from 'vitest';
import { UserQueryPort, UserSummaryDto } from '../../ports/user-query.port';
import { ListUsersHandler } from './list-users.handler';
import { ListUsersQuery } from './list-users.query';

function fakePort(result: UserSummaryDto[] = []): UserQueryPort {
  return {
    findActiveByDocument: vi.fn(),
    listActive: vi.fn().mockResolvedValue(result),
  };
}

describe('ListUsersHandler', () => {
  it('passes the role through and leaves the document undefined when none is supplied', async () => {
    const port = fakePort();
    const handler = new ListUsersHandler(port);

    await handler.execute(new ListUsersQuery('MECHANIC'));

    expect(port.listActive).toHaveBeenCalledWith({ role: 'MECHANIC', document: undefined });
  });

  it('normalises a formatted CPF to its digits before filtering', async () => {
    const port = fakePort();
    const handler = new ListUsersHandler(port);

    await handler.execute(new ListUsersQuery(undefined, '111.444.777-35'));

    expect(port.listActive).toHaveBeenCalledWith({ role: undefined, document: '11144477735' });
  });

  it('answers an empty list for a malformed document filter, never an error', async () => {
    const port = fakePort([{ id: 'x' } as UserSummaryDto]);
    const handler = new ListUsersHandler(port);

    const result = await handler.execute(new ListUsersQuery(undefined, '000'));

    expect(result).toEqual([]);
    expect(port.listActive).not.toHaveBeenCalled();
  });

  it('returns exactly what the port answers', async () => {
    const rows = [{ id: '11111111-1111-4111-8111-111111111111' } as UserSummaryDto];
    const handler = new ListUsersHandler(fakePort(rows));

    await expect(handler.execute(new ListUsersQuery())).resolves.toBe(rows);
  });
});
