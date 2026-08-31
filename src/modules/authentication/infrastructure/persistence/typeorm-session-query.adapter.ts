import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { SessionQueryPort, SessionSummaryDto } from '../../application/ports/session-query.port';
import { SessionStatus } from '../../domain/session-status';
import { SessionOrmEntity } from './session.orm-entity';

@Injectable()
export class TypeOrmSessionQueryAdapter implements SessionQueryPort {
  constructor(
    @InjectRepository(SessionOrmEntity)
    private readonly sessions: Repository<SessionOrmEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async listActiveByUserId(userId: string): Promise<SessionSummaryDto[]> {
    const userRows: Array<{ id: string }> = await this.dataSource.query(
      `SELECT id FROM users WHERE external_id = $1`,
      [userId],
    );
    if (userRows.length === 0) {
      return [];
    }
    const rows = await this.sessions.find({
      where: { userInternalId: userRows[0].id, status: SessionStatus.Active },
      order: { createdAt: 'DESC' },
    });
    return rows.map((row) => ({
      id: row.externalId,
      ip: row.ip,
      userAgent: row.userAgent,
      createdAt: row.createdAt.toISOString(),
      lastUsedAt: row.lastUsedAt.toISOString(),
    }));
  }
}
