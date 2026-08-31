import { randomUUID } from 'node:crypto';
import { faker } from '@faker-js/faker';
import { User } from '../../../src/modules/users/domain/entities/user';
import { Email } from '../../../src/modules/users/domain/value-objects/email';
import { PasswordHash } from '../../../src/modules/users/domain/value-objects/password-hash';
import { PersonDocument } from '../../../src/modules/users/domain/value-objects/person-document';
import { UserId } from '../../../src/modules/users/domain/value-objects/user-id';
import { uniqueValidCpf } from './document.factory';

export interface UserFactoryOverrides {
  id?: string;
  email?: string;
  name?: string;
  document?: string;
  passwordHash?: string;
  now?: Date;
  temporary?: boolean;
}

export function buildUser(overrides: UserFactoryOverrides = {}): User {
  return User.register({
    id: UserId.create(overrides.id ?? randomUUID()),
    email: Email.create(overrides.email ?? faker.internet.email()),
    name: overrides.name ?? faker.person.fullName(),
    document: PersonDocument.create(overrides.document ?? uniqueValidCpf()),
    passwordHash: PasswordHash.create(overrides.passwordHash ?? `hashed:${faker.internet.password()}`),
    now: overrides.now ?? new Date('2026-08-26T12:00:00.000Z'),
    temporary: overrides.temporary,
  });
}
