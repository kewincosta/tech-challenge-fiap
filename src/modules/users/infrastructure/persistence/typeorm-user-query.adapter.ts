import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import {
  ListUsersFilter,
  UserQueryPort,
  UserSummaryDto,
} from '../../application/ports/user-query.port';
import { UserOrmEntity } from './user.orm-entity';

interface UserListRow {
  external_id: string;
  email: string;
  name: string;
  document: string;
  status: string;
}

@Injectable()
export class TypeOrmUserQueryAdapter implements UserQueryPort {
  constructor(
    @InjectRepository(UserOrmEntity)
    private readonly users: Repository<UserOrmEntity>,
    private readonly dataSource: DataSource,
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

  async listActive(filter: ListUsersFilter): Promise<UserSummaryDto[]> {
    // Raw SQL, not a TypeORM relation: user_roles/roles belong to the authorization module, and
    // AD-003 forbids importing another module's repository or entities - a plain join against the
    // real table names, the same way TypeOrmAssignmentRepository and TypeOrmSessionQueryAdapter
    // already read across module-owned tables, keeps that boundary at the application layer while
    // still answering one filtered read in one query.
    const rows: UserListRow[] = await this.dataSource.query(
      `SELECT u.external_id, u.email, u.name, u.document, u.status
         FROM users u
        WHERE u.deleted_at IS NULL
          AND ($1::varchar IS NULL OR u.document = $1)
          AND (
            $2::varchar IS NULL OR EXISTS (
              SELECT 1 FROM user_roles ur
                JOIN roles r ON r.id = ur.role_id
               WHERE ur.user_id = u.id AND r.name = $2
            )
          )
        ORDER BY u.created_at DESC`,
      [filter.document ?? null, filter.role ?? null],
    );
    return rows.map((row) => ({
      id: row.external_id,
      email: row.email,
      name: row.name,
      document: row.document,
      status: row.status,
    }));
  }
}
