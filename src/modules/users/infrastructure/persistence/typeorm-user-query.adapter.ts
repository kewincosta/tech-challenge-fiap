import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { UserQueryPort, UserSummaryDto } from '../../application/ports/user-query.port';
import { UserOrmEntity } from './user.orm-entity';

@Injectable()
export class TypeOrmUserQueryAdapter implements UserQueryPort {
  constructor(
    @InjectRepository(UserOrmEntity)
    private readonly users: Repository<UserOrmEntity>,
  ) {}

  async findActiveByDocument(document: string): Promise<UserSummaryDto | null> {
    const row = await this.users.findOne({ where: { document, deletedAt: IsNull() } });
    if (!row) {
      return null;
    }
    return {
      id: row.externalId,
      email: row.email,
      name: row.name,
      document: row.document,
      status: row.status,
    };
  }
}
