import { describe, expect, it } from 'vitest';
import { FindUsersFilter, UserQueryPort, UserSummaryDto } from '../../ports/user-query.port';
import { FindUsersQuery } from './find-users.query';
import { FindUsersUseCase } from './find-users.use-case';

const MARIA: UserSummaryDto = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'maria@example.com',
  name: 'Maria Documento',
  document: '11144477735',
  status: 'ACTIVE',
};

const OFICINA: UserSummaryDto = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'contato@oficina.example.com',
  name: 'Oficina Exemplo',
  document: '11222333000181',
  status: 'ACTIVE',
};

// Matches a document the way the adapter does, by its digits only, and keeps the filters it got.
class InMemoryUserQuery implements UserQueryPort {
  readonly filters: FindUsersFilter[] = [];

  constructor(private readonly users: UserSummaryDto[]) {}

  find(filter: FindUsersFilter): Promise<UserSummaryDto[]> {
    this.filters.push(filter);
    return Promise.resolve(
      this.users.filter(
        (user) => filter.document === undefined || user.document === filter.document,
      ),
    );
  }

  findActiveByDocument(): Promise<UserSummaryDto | null> {
    return Promise.resolve(null);
  }

  listActive(): Promise<UserSummaryDto[]> {
    return Promise.resolve([]);
  }
}

describe('FindUsersUseCase', () => {
  it.each(['123', '11111111111'])(
    'answers an empty list for the malformed document %s and never reaches the port',
    async (document) => {
      const port = new InMemoryUserQuery([MARIA, OFICINA]);

      const result = await new FindUsersUseCase(port).execute(
        new FindUsersQuery(undefined, undefined, document),
      );

      expect(result).toEqual([]);
      expect(port.filters).toEqual([]);
    },
  );

  it.each([
    ['CPF', '111.444.777-35', MARIA],
    ['CNPJ', '11.222.333/0001-81', OFICINA],
  ])('normalizes a masked %s to its digits before the port', async (_kind, masked, expected) => {
    const port = new InMemoryUserQuery([MARIA, OFICINA]);

    const result = await new FindUsersUseCase(port).execute(
      new FindUsersQuery(undefined, undefined, masked),
    );

    expect(result).toEqual([expected]);
    expect(port.filters).toEqual([{ document: expected.document }]);
  });

  it('passes the ids and the name fragment through and returns what the port answers', async () => {
    const port = new InMemoryUserQuery([MARIA, OFICINA]);

    const result = await new FindUsersUseCase(port).execute(new FindUsersQuery([MARIA.id], 'mar'));

    expect(result).toEqual([MARIA, OFICINA]);
    expect(port.filters).toEqual([{ ids: [MARIA.id], nameContains: 'mar' }]);
  });
});
