import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, QueryFailedError, Repository } from 'typeorm';
import { currentEntityManager } from '../../../../shared/infrastructure/database/typeorm-transaction-runner';
import { User } from '../../domain/entities/user';
import { DocumentAlreadyInUseError } from '../../domain/errors/document-already-in-use.error';
import { UserRepository } from '../../domain/repositories/user.repository';
import { Email } from '../../domain/value-objects/email';
import { PersonDocument } from '../../domain/value-objects/person-document';
import { UserId } from '../../domain/value-objects/user-id';
import { UserMapper } from './user.mapper';
import { UserOrmEntity } from './user.orm-entity';

const UNIQUE_VIOLATION = '23505';
const DOCUMENT_CONSTRAINT = 'ux_users_document';

@Injectable()
export class TypeOrmUserRepository implements UserRepository {
  constructor(
    @InjectRepository(UserOrmEntity)
    private readonly repository: Repository<UserOrmEntity>,
  ) {}

  async findById(id: UserId): Promise<User | null> {
    const row = await this.repo().findOne({ where: { externalId: id.value } });
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

  async findByDocument(document: PersonDocument): Promise<User | null> {
    const row = await this.repository.findOne({
      where: { document: document.value, deletedAt: IsNull() },
    });
    return row ? UserMapper.toDomain(row) : null;
  }

  async existsByDocument(document: PersonDocument): Promise<boolean> {
    return this.repository.exists({ where: { document: document.value, deletedAt: IsNull() } });
  }

  async save(user: User): Promise<void> {
    const repo = this.repo();
    const row = UserMapper.toOrm(user);
    const existing = await repo.findOne({
      where: { externalId: user.id.value },
      select: { id: true },
    });
    if (existing) {
      row.id = existing.id;
    }
    try {
      await repo.save(row);
    } catch (error) {
      if (this.isUniqueViolation(error, DOCUMENT_CONSTRAINT)) {
        throw new DocumentAlreadyInUseError();
      }
      throw error;
    }
  }

  /**
   * Returns the repository bound to the transaction open on this async context (see
   * TypeOrmTransactionRunner), or the default injected repository outside a transaction. Only the
   * methods a RegisterUserHandler transaction actually touches - save and findById, the latter
   * reached indirectly through GetUserByIdQuery when AssignRoleToUserHandler checks the user
   * exists - need this; the rest run before any transaction opens.
   */
  private repo(): Repository<UserOrmEntity> {
    const manager = currentEntityManager();
    return manager ? manager.getRepository(UserOrmEntity) : this.repository;
  }

  private isUniqueViolation(error: unknown, constraint: string): boolean {
    return (
      error instanceof QueryFailedError &&
      (error.driverError as { code?: string; constraint?: string }).code === UNIQUE_VIOLATION &&
      (error.driverError as { constraint?: string }).constraint === constraint
    );
  }
}
