import { UserRepository } from '../../../src/modules/identity/users/application/ports/user.repository';
import { User } from '../../../src/modules/identity/users/domain/entities/user';
import { AccountInUseError } from '../../../src/modules/identity/users/domain/errors/account-in-use.error';
import { Email } from '../../../src/modules/identity/users/domain/value-objects/email';
import { PersonDocument } from '../../../src/modules/identity/users/domain/value-objects/person-document';
import { UserId } from '../../../src/modules/identity/users/domain/value-objects/user-id';

// A database hands back a new object each time, so a change to a user it handed out reaches the
// store only through `save`. The copy carries no pending events, like a user the repository loaded.
function copyOf(user: User): User {
  return User.restore({
    id: user.id,
    email: user.email,
    name: user.name,
    document: user.document,
    passwordHash: user.passwordHash,
    status: user.status,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    deletedAt: user.deletedAt,
  });
}

export class InMemoryUserRepository implements UserRepository {
  users: User[] = [];
  /** Users a record of another module points at, which the database's foreign key would not let go. */
  readonly referenced = new Set<string>();

  async findById(id: UserId): Promise<User | null> {
    const found = this.users.find((user) => user.id.equals(id));
    return Promise.resolve(found ? copyOf(found) : null);
  }

  async findByEmail(email: Email): Promise<User | null> {
    const found = this.users.find((user) => user.email.equals(email) && user.deletedAt === null);
    return Promise.resolve(found ? copyOf(found) : null);
  }

  async existsByEmail(email: Email): Promise<boolean> {
    return Promise.resolve(
      this.users.some((user) => user.email.equals(email) && user.deletedAt === null),
    );
  }

  async findByDocument(document: PersonDocument): Promise<User | null> {
    const found = this.users.find(
      (user) => user.document.equals(document) && user.deletedAt === null,
    );
    return Promise.resolve(found ? copyOf(found) : null);
  }

  async existsByDocument(document: PersonDocument): Promise<boolean> {
    return Promise.resolve(
      this.users.some((user) => user.document.equals(document) && user.deletedAt === null),
    );
  }

  async save(user: User): Promise<void> {
    this.users = this.users.filter((existing) => !existing.id.equals(user.id));
    this.users.push(copyOf(user));
    return Promise.resolve();
  }

  async delete(id: UserId): Promise<void> {
    if (this.referenced.has(id.value)) {
      return Promise.reject(new AccountInUseError());
    }
    this.users = this.users.filter((existing) => !existing.id.equals(id));
    return Promise.resolve();
  }
}
