import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { FindUsersQuery, FindUsersUseCase, UserSummaryDto } from '../../src/modules/identity';
import { PersonDocument } from '../../src/modules/identity/users/domain/value-objects/person-document';
import { TypeOrmUserQueryAdapter } from '../../src/modules/identity/users/infrastructure/persistence/typeorm-user-query.adapter';
import { TypeOrmUserRepository } from '../../src/modules/identity/users/infrastructure/persistence/typeorm-user.repository';
import { UserOrmEntity } from '../../src/modules/identity/users/infrastructure/persistence/user.orm-entity';
import { uniqueValidCpf } from '../support/factories/document.factory';
import { buildUser } from '../support/factories/user.factory';
import { createTestDataSource } from '../support/db';

let dataSource: DataSource;
let userRepository: TypeOrmUserRepository;
let useCase: FindUsersUseCase;

beforeAll(async () => {
  dataSource = createTestDataSource();
  await dataSource.initialize();
  const usersRepo = dataSource.getRepository(UserOrmEntity);
  userRepository = new TypeOrmUserRepository(usersRepo);
  useCase = new FindUsersUseCase(new TypeOrmUserQueryAdapter(usersRepo, dataSource));
});

afterAll(async () => {
  await dataSource.destroy();
});

// Saves a user through the repository and returns what the use case is expected to show of it.
async function saveUser(
  overrides: { name?: string; document?: string; deactivated?: boolean } = {},
): Promise<UserSummaryDto> {
  const user = buildUser({
    email: `${randomUUID()}@example.com`,
    name: overrides.name,
    document: overrides.document ?? uniqueValidCpf(),
  });
  await userRepository.save(user);
  if (overrides.deactivated) {
    user.deactivate(new Date());
    await userRepository.save(user);
  }
  return {
    id: user.id.value,
    email: user.email.value,
    name: user.name,
    document: user.document.value,
    status: user.status,
  };
}

function byId(users: UserSummaryDto[]): UserSummaryDto[] {
  return [...users].sort((a, b) => a.id.localeCompare(b.id));
}

function uniqueLetters(): string {
  return Array.from({ length: 12 }, () =>
    String.fromCharCode(97 + Math.floor(Math.random() * 26)),
  ).join('');
}

// The first valid CNPJ whose digits begin with the CPF's: a prefix or substring match on the
// document would return its holder too.
function cnpjStartingWith(cpf: string): string {
  for (let tail = 0; tail < 1000; tail++) {
    const candidate = `${cpf}${String(tail).padStart(3, '0')}`;
    try {
      return PersonDocument.create(candidate).value;
    } catch {
      // not a valid CNPJ, try the next tail
    }
  }
  throw new Error(`no CNPJ starts with ${cpf}`);
}

describe('FindUsersUseCase', () => {
  it('returns the users with the given ids whatever their status', async () => {
    const active = await saveUser();
    const deactivated = await saveUser({ deactivated: true });
    await saveUser();

    const found = await useCase.execute(
      new FindUsersQuery([active.id, deactivated.id, randomUUID()]),
    );

    expect(byId(found)).toEqual(byId([active, deactivated]));
    expect(deactivated.status).toBe('INACTIVE');
  });

  it('returns nobody for an empty list of ids', async () => {
    await saveUser();

    expect(await useCase.execute(new FindUsersQuery([]))).toEqual([]);
  });

  it('returns the users whose name contains the fragment in any letter case and any position', async () => {
    const token = uniqueLetters();
    const inTheMiddle = await saveUser({ name: `Zelia ${token.toUpperCase()} Lima` });
    const atTheStart = await saveUser({ name: `${token} Bruno` });
    const atTheEnd = await saveUser({ name: `Carla ${token[0].toUpperCase()}${token.slice(1)}` });
    const deactivated = await saveUser({ name: `Diego ${token} Inativo`, deactivated: true });
    await saveUser({ name: 'Eva Sem Filtro' });
    const expected = byId([inTheMiddle, atTheStart, atTheEnd, deactivated]);
    const mixedCase = `${token.slice(0, 5)}${token.slice(5).toUpperCase()}`;

    for (const fragment of [token, token.toUpperCase(), mixedCase]) {
      const found = await useCase.execute(new FindUsersQuery(undefined, fragment));

      expect(byId(found)).toEqual(expected);
    }
  });

  it('returns only the users holding exactly the document, bare or masked, whatever their status', async () => {
    const holder = await saveUser();
    const longerDocumentHolder = await saveUser({ document: cnpjStartingWith(holder.document) });
    await saveUser();
    const deactivated = await saveUser({ deactivated: true });
    const masked = `${holder.document.slice(0, 3)}.${holder.document.slice(3, 6)}.${holder.document.slice(6, 9)}-${holder.document.slice(9)}`;

    expect(longerDocumentHolder.document.startsWith(holder.document)).toBe(true);
    expect(
      await useCase.execute(new FindUsersQuery(undefined, undefined, holder.document)),
    ).toEqual([holder]);
    expect(await useCase.execute(new FindUsersQuery(undefined, undefined, masked))).toEqual([
      holder,
    ]);
    expect(
      await useCase.execute(new FindUsersQuery(undefined, undefined, deactivated.document)),
    ).toEqual([deactivated]);
  });

  it('returns only the users that satisfy every filter given', async () => {
    const token = uniqueLetters();
    const first = await saveUser({ name: `Ana ${token}` });
    const second = await saveUser({ name: `Beto ${token}` });
    const outsider = await saveUser({ name: 'Caio Sem Filtro' });

    expect(await useCase.execute(new FindUsersQuery([first.id, outsider.id], token))).toEqual([
      first,
    ]);
    expect(await useCase.execute(new FindUsersQuery(undefined, token, second.document))).toEqual([
      second,
    ]);
    expect(await useCase.execute(new FindUsersQuery([first.id], token, second.document))).toEqual(
      [],
    );
  });
});
