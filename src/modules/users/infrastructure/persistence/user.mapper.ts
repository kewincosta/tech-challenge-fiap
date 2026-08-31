import { User } from '../../domain/entities/user';
import { UserStatus } from '../../domain/user-status';
import { Email } from '../../domain/value-objects/email';
import { PasswordHash } from '../../domain/value-objects/password-hash';
import { UserId } from '../../domain/value-objects/user-id';
import { UserOrmEntity } from './user.orm-entity';

export class UserMapper {
  static toDomain(row: UserOrmEntity): User {
    return User.restore({
      id: UserId.create(row.externalId),
      email: Email.create(row.email),
      name: row.name,
      passwordHash: PasswordHash.create(row.passwordHash),
      status: row.status as UserStatus,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt,
    });
  }

  static toOrm(user: User): UserOrmEntity {
    const row = new UserOrmEntity();
    row.externalId = user.id.value;
    row.email = user.email.value;
    row.passwordHash = user.passwordHash.value;
    row.name = user.name;
    row.status = user.status;
    row.createdAt = user.createdAt;
    row.updatedAt = user.updatedAt;
    row.deletedAt = user.deletedAt;
    return row;
  }
}
