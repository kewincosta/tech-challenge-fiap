import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { Session } from '../../domain/entities/session';
import { InvalidRefreshTokenError } from '../../domain/errors/invalid-refresh-token.error';
import { RefreshTokenStatus } from '../../domain/refresh-token-status';
import { SessionRepository } from '../../domain/repositories/session.repository';
import { SessionRevocationReason } from '../../domain/session-revocation-reason';
import { SessionStatus } from '../../domain/session-status';
import { RefreshTokenHash } from '../../domain/value-objects/refresh-token-hash';
import { SessionId } from '../../domain/value-objects/session-id';
import { RefreshTokenOrmEntity } from './refresh-token.orm-entity';
import { SessionMapper } from './session.mapper';
import { SessionOrmEntity } from './session.orm-entity';

const UNIQUE_VIOLATION = '23505';

@Injectable()
export class TypeOrmSessionRepository implements SessionRepository {
  constructor(
    @InjectRepository(SessionOrmEntity)
    private readonly sessions: Repository<SessionOrmEntity>,
    @InjectRepository(RefreshTokenOrmEntity)
    private readonly tokens: Repository<RefreshTokenOrmEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async findById(id: SessionId): Promise<Session | null> {
    const sessionRow = await this.sessions.findOne({ where: { id: id.value } });
    if (!sessionRow) {
      return null;
    }
    const tokenRows = await this.tokens.find({
      where: { sessionId: sessionRow.id, status: RefreshTokenStatus.Active },
    });
    return SessionMapper.toDomain(sessionRow, tokenRows);
  }

  async findByRefreshTokenHash(hash: RefreshTokenHash): Promise<Session | null> {
    const tokenRow = await this.tokens.findOne({ where: { tokenHash: hash.value } });
    if (!tokenRow) {
      return null;
    }
    const sessionRow = await this.sessions.findOne({ where: { id: tokenRow.sessionId } });
    if (!sessionRow) {
      return null;
    }
    return SessionMapper.toDomain(sessionRow, [tokenRow]);
  }

  async save(session: Session): Promise<void> {
    const { sessionRow, tokenRows } = SessionMapper.toOrm(session);
    const supersededRows = tokenRows.filter(
      (row) => (row.status as RefreshTokenStatus) !== RefreshTokenStatus.Active,
    );
    const activeRows = tokenRows.filter(
      (row) => (row.status as RefreshTokenStatus) === RefreshTokenStatus.Active,
    );
    try {
      await this.dataSource.transaction(async (manager) => {
        await manager.save(SessionOrmEntity, sessionRow);
        if (supersededRows.length > 0) {
          await manager.save(RefreshTokenOrmEntity, supersededRows);
        }
        if (activeRows.length > 0) {
          await manager.save(RefreshTokenOrmEntity, activeRows);
        }
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new InvalidRefreshTokenError();
      }
      throw error;
    }
  }

  async revokeAllActiveByUserId(
    userId: string,
    reason: SessionRevocationReason,
    now: Date,
  ): Promise<string[]> {
    return this.dataSource.transaction(async (manager) => {
      const updateResult = await manager
        .createQueryBuilder()
        .update(SessionOrmEntity)
        .set({ status: SessionStatus.Revoked, revokedAt: now, revocationReason: reason })
        .where('user_id = :userId AND status = :active', {
          userId,
          active: SessionStatus.Active,
        })
        .returning(['id'])
        .execute();
      const revokedIds = (updateResult.raw as Array<{ id: string }>).map((row) => row.id);
      if (revokedIds.length > 0) {
        await manager
          .createQueryBuilder()
          .update(RefreshTokenOrmEntity)
          .set({ status: RefreshTokenStatus.Revoked })
          .where('session_id IN (:...revokedIds) AND status = :active', {
            revokedIds,
            active: RefreshTokenStatus.Active,
          })
          .execute();
      }
      return revokedIds;
    });
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof QueryFailedError &&
      (error.driverError as { code?: string }).code === UNIQUE_VIOLATION
    );
  }
}
