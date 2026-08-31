import { User } from '../../../src/modules/users/domain/entities/user';
import { UserRepository } from '../../../src/modules/users/domain/repositories/user.repository';
import { Email } from '../../../src/modules/users/domain/value-objects/email';
import { UserId } from '../../../src/modules/users/domain/value-objects/user-id';

export class InMemoryUserRepository implements UserRepository {
  users: User[] = [];

  async findById(id: UserId): Promise<User | null> {
    return Promise.resolve(this.users.find((user) => user.id.equals(id)) ?? null);
  }

  async findByEmail(email: Email): Promise<User | null> {
    return Promise.resolve(
      this.users.find((user) => user.email.equals(email) && user.deletedAt === null) ?? null,
    );
  }

  async existsByEmail(email: Email): Promise<boolean> {
    return Promise.resolve(
      this.users.some((user) => user.email.equals(email) && user.deletedAt === null),
    );
  }

  async save(user: User): Promise<void> {
    this.users = this.users.filter((existing) => !existing.id.equals(user.id));
    this.users.push(user);
    return Promise.resolve();
  }
}
