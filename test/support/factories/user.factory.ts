import { randomUUID } from 'node:crypto';
import { faker } from '@faker-js/faker';
import { User } from '../../../src/modules/users/domain/entities/user';
import { Email } from '../../../src/modules/users/domain/value-objects/email';
import { PasswordHash } from '../../../src/modules/users/domain/value-objects/password-hash';
import { UserId } from '../../../src/modules/users/domain/value-objects/user-id';

export interface UserFactoryOverrides {
  id?: string;
  email?: string;
  name?: string;
  passwordHash?: string;
  now?: Date;
}

export function buildUser(overrides: UserFactoryOverrides = {}): User {
  return User.register({
    id: UserId.create(overrides.id ?? randomUUID()),
    email: Email.create(overrides.email ?? faker.internet.email()),
    name: overrides.name ?? faker.person.fullName(),
    passwordHash: PasswordHash.create(overrides.passwordHash ?? `hashed:${faker.internet.password()}`),
    now: overrides.now ?? new Date('2026-08-26T12:00:00.000Z'),
  });
}
