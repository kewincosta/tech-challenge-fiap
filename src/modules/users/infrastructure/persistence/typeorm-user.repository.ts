import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { User } from '../../domain/entities/user';
import { UserRepository } from '../../domain/repositories/user.repository';
import { Email } from '../../domain/value-objects/email';
import { UserId } from '../../domain/value-objects/user-id';
import { UserMapper } from './user.mapper';
import { UserOrmEntity } from './user.orm-entity';

@Injectable()
export class TypeOrmUserRepository implements UserRepository {
  constructor(
    @InjectRepository(UserOrmEntity)
    private readonly repository: Repository<UserOrmEntity>,
  ) {}

  async findById(id: UserId): Promise<User | null> {
    const row = await this.repository.findOne({ where: { externalId: id.value } });
    return row ? UserMapper.toDomain(row) : null;
  }

  async findByEmail(email: Email): Promise<User | null> {
    const row = await this.repository.findOne({
      where: { email: email.value, deletedAt: IsNull() },
    });
    return row ? UserMapper.toDomain(row) : null;
  }

  async existsByEmail(email: Email): Promise<boolean> {
    return this.repository.exists({ where: { email: email.value, deletedAt: IsNull() } });
  }

  async save(user: User): Promise<void> {
    const row = UserMapper.toOrm(user);
    const existing = await this.repository.findOne({
      where: { externalId: user.id.value },
      select: { id: true },
    });
    if (existing) {
      row.id = existing.id;
    }
    await this.repository.save(row);
  }
}
