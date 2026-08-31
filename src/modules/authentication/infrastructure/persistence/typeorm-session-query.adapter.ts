import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SessionQueryPort, SessionSummaryDto } from '../../application/ports/session-query.port';
import { SessionStatus } from '../../domain/session-status';
import { SessionOrmEntity } from './session.orm-entity';

@Injectable()
export class TypeOrmSessionQueryAdapter implements SessionQueryPort {
  constructor(
    @InjectRepository(SessionOrmEntity)
    private readonly sessions: Repository<SessionOrmEntity>,
  ) {}

  async listActiveByUserId(userId: string): Promise<SessionSummaryDto[]> {
    const rows = await this.sessions.find({
      where: { userId, status: SessionStatus.Active },
      order: { createdAt: 'DESC' },
    });
    return rows.map((row) => ({
      id: row.id,
      ip: row.ip,
      userAgent: row.userAgent,
      createdAt: row.createdAt.toISOString(),
      lastUsedAt: row.lastUsedAt.toISOString(),
    }));
  }
}
