import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { FindUserByDocumentQuery } from '../../src/modules/users/application/queries/find-user-by-document/find-user-by-document.query';
import { FindUserByDocumentHandler } from '../../src/modules/users/application/queries/find-user-by-document/find-user-by-document.handler';
import { TypeOrmUserQueryAdapter } from '../../src/modules/users/infrastructure/persistence/typeorm-user-query.adapter';
import { TypeOrmUserRepository } from '../../src/modules/users/infrastructure/persistence/typeorm-user.repository';
import { UserOrmEntity } from '../../src/modules/users/infrastructure/persistence/user.orm-entity';
import { buildUser } from '../support/factories/user.factory';
import { uniqueValidCpf } from '../support/factories/document.factory';
import { createTestDataSource } from '../support/db';

let dataSource: DataSource;
let handler: FindUserByDocumentHandler;
let userRepository: TypeOrmUserRepository;

function uniqueEmail(): string {
  return `${randomUUID()}@example.com`;
}

beforeAll(async () => {
  dataSource = createTestDataSource();
  await dataSource.initialize();
  const usersRepo = dataSource.getRepository(UserOrmEntity);
  userRepository = new TypeOrmUserRepository(usersRepo);
  handler = new FindUserByDocumentHandler(new TypeOrmUserQueryAdapter(usersRepo));
});

afterAll(async () => {
  await dataSource.destroy();
});

describe('FindUserByDocumentHandler', () => {
  it('should return the matching active user by document', async () => {
    const document = uniqueValidCpf();
    const user = buildUser({ email: uniqueEmail(), document });
    await userRepository.save(user);

    const result = await handler.execute(new FindUserByDocumentQuery(document));

    expect(result?.id).toBe(user.id.value);
    expect(result?.document).toBe(document);
    expect(result?.email).toBe(user.email.value);
  });

  it('should return null for a document that does not exist', async () => {
    const result = await handler.execute(new FindUserByDocumentQuery(uniqueValidCpf()));

    expect(result).toBeNull();
  });

  it('should not return a deactivated user', async () => {
    const document = uniqueValidCpf();
    const user = buildUser({ email: uniqueEmail(), document });
    await userRepository.save(user);
    user.deactivate(new Date());
    await userRepository.save(user);

    const result = await handler.execute(new FindUserByDocumentQuery(document));

    expect(result).toBeNull();
  });

  it('should return null for a malformed document without raising', async () => {
    const result = await handler.execute(new FindUserByDocumentQuery('not-a-document'));

    expect(result).toBeNull();
  });
});
