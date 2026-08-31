import { randomUUID } from 'node:crypto';
import { CommandBus } from '@nestjs/cqrs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { RegisterUserCommand } from '../../src/modules/users/application/commands/register-user/register-user.command';
import { RegisterUserHandler } from '../../src/modules/users/application/commands/register-user/register-user.handler';
import { DocumentAlreadyInUseError } from '../../src/modules/users/domain/errors/document-already-in-use.error';
import { Email } from '../../src/modules/users/domain/value-objects/email';
import { PersonDocument } from '../../src/modules/users/domain/value-objects/person-document';
import { TypeOrmUserRepository } from '../../src/modules/users/infrastructure/persistence/typeorm-user.repository';
import { UserOrmEntity } from '../../src/modules/users/infrastructure/persistence/user.orm-entity';
import { TypeOrmTransactionRunner } from '../../src/shared/infrastructure/database/typeorm-transaction-runner';
import { stubEventBus } from '../support/fakes/bus.stubs';
import { FakeClock } from '../support/fakes/fake-clock';
import { FakeIdGenerator } from '../support/fakes/fake-id-generator';
import { FakePasswordHasher } from '../support/fakes/fake-password-hasher';
import { buildUser } from '../support/factories/user.factory';
import { uniqueValidCpf } from '../support/factories/document.factory';
import { createTestDataSource } from '../support/db';

let dataSource: DataSource;
let repository: TypeOrmUserRepository;

function uniqueEmail(): string {
  return `${randomUUID()}@example.com`;
}

beforeAll(async () => {
  dataSource = createTestDataSource();
  await dataSource.initialize();
  repository = new TypeOrmUserRepository(dataSource.getRepository(UserOrmEntity));
});

afterAll(async () => {
  await dataSource.destroy();
});

describe('TypeOrmUserRepository', () => {
  it('should persist a user and find it by its document', async () => {
    const document = uniqueValidCpf();
    const user = buildUser({ email: uniqueEmail(), document });
    await repository.save(user);

    const found = await repository.findByDocument(PersonDocument.create(document));
    const exists = await repository.existsByDocument(PersonDocument.create(document));
    const otherExists = await repository.existsByDocument(PersonDocument.create(uniqueValidCpf()));

    expect(found?.id.value).toBe(user.id.value);
    expect(found?.document.value).toBe(document);
    expect(exists).toBe(true);
    expect(otherExists).toBe(false);
  });

  it('should reject a second user registered with a document already in use', async () => {
    const document = uniqueValidCpf();
    const first = buildUser({ email: uniqueEmail(), document });
    const second = buildUser({ email: uniqueEmail(), document });
    await repository.save(first);

    await expect(repository.save(second)).rejects.toThrow(DocumentAlreadyInUseError);
  });

  it('should roll back the user insert when the role assignment fails', async () => {
    const transactionRunner = new TypeOrmTransactionRunner(dataSource);
    const assignmentFailure = new Error('role assignment failed');
    const failingCommandBus = {
      execute: () => Promise.reject(assignmentFailure),
    } as unknown as CommandBus;
    const handler = new RegisterUserHandler(
      repository,
      new FakePasswordHasher(),
      new FakeIdGenerator(),
      new FakeClock(),
      transactionRunner,
      failingCommandBus,
      stubEventBus().bus,
    );
    const email = uniqueEmail();
    const document = uniqueValidCpf();

    await expect(
      handler.execute(new RegisterUserCommand(email, 'Jane Doe', 'Str0ngPassword', document)),
    ).rejects.toThrow(assignmentFailure);

    expect(await repository.existsByEmail(Email.create(email))).toBe(false);
    expect(await repository.existsByDocument(PersonDocument.create(document))).toBe(false);
  });
});
