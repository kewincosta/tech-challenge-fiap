import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, QueryFailedError, Repository } from 'typeorm';
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
    const sessionRow = await this.sessions.findOne({ where: { externalId: id.value } });
    if (!sessionRow) {
      return null;
    }
    const tokenRows = await this.tokens.find({
      where: { sessionInternalId: sessionRow.id, status: RefreshTokenStatus.Active },
    });
    const userExternalId = await this.resolveUserExternalId(
      this.dataSource,
      sessionRow.userInternalId,
    );
    const replacedByExternalIds = await this.resolveReplacedByExternalIds(
      this.dataSource,
      tokenRows,
    );
    return SessionMapper.toDomain(sessionRow, tokenRows, userExternalId, replacedByExternalIds);
  }

  async findByRefreshTokenHash(hash: RefreshTokenHash): Promise<Session | null> {
    const tokenRow = await this.tokens.findOne({ where: { tokenHash: hash.value } });
    if (!tokenRow) {
      return null;
    }
    const sessionRow = await this.sessions.findOne({
      where: { id: tokenRow.sessionInternalId },
    });
    if (!sessionRow) {
      return null;
    }
    const userExternalId = await this.resolveUserExternalId(
      this.dataSource,
      sessionRow.userInternalId,
    );
    const replacedByExternalIds = await this.resolveReplacedByExternalIds(this.dataSource, [
      tokenRow,
    ]);
    return SessionMapper.toDomain(sessionRow, [tokenRow], userExternalId, replacedByExternalIds);
  }

  async save(session: Session): Promise<void> {
    const { sessionRow, tokenRows } = SessionMapper.toOrm(session);
    try {
      await this.dataSource.transaction(async (manager) => {
        const existingSession = await manager.findOne(SessionOrmEntity, {
          where: { externalId: sessionRow.externalId },
          select: { id: true },
        });
        if (existingSession) {
          sessionRow.id = existingSession.id;
        }
        sessionRow.userInternalId = await this.resolveUserInternalId(manager, session.userId);
        await manager.save(SessionOrmEntity, sessionRow);

        for (const tokenRow of tokenRows) {
          const existingToken = await manager.findOne(RefreshTokenOrmEntity, {
            where: { externalId: tokenRow.externalId },
            select: { id: true },
          });
          if (existingToken) {
            tokenRow.id = existingToken.id;
          }
          tokenRow.sessionInternalId = sessionRow.id;
        }
        const supersededRows = tokenRows.filter(
          (row) => (row.status as RefreshTokenStatus) !== RefreshTokenStatus.Active,
        );
        const activeRows = tokenRows.filter(
          (row) => (row.status as RefreshTokenStatus) === RefreshTokenStatus.Active,
        );
        // Superseded rows save first: the partial unique index on (session_id) WHERE
        // status = 'ACTIVE' allows only one active row per session, so the outgoing token must
        // be demoted before the incoming one is inserted as active.
        if (supersededRows.length > 0) {
          await manager.save(RefreshTokenOrmEntity, supersededRows);
        }
        if (activeRows.length > 0) {
          await manager.save(RefreshTokenOrmEntity, activeRows);
        }

        // Second pass: every token in this batch now has an internal id (existing or newly
        // generated), so the "replaced by" self-reference - deferred at the schema level for
        // exactly this reason - can be resolved from the domain's external ids and applied.
        const internalIdByExternalId = new Map(tokenRows.map((row) => [row.externalId, row.id]));
        for (let index = 0; index < session.tokens.length; index += 1) {
          const replacedByExternalId = session.tokens[index].replacedById;
          if (!replacedByExternalId) {
            continue;
          }
          const replacedByInternalId = internalIdByExternalId.get(replacedByExternalId);
          if (replacedByInternalId) {
            await manager.update(
              RefreshTokenOrmEntity,
              { id: tokenRows[index].id },
              { replacedByInternalId },
            );
          }
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
      const userInternalId = await this.resolveUserInternalId(manager, userId);
      const updateResult = await manager
        .createQueryBuilder()
        .update(SessionOrmEntity)
        .set({ status: SessionStatus.Revoked, revokedAt: now, revocationReason: reason })
        .where('user_id = :userInternalId AND status = :active', {
          userInternalId,
          active: SessionStatus.Active,
        })
        .returning(['id', 'external_id'])
        .execute();
      const revokedRows = updateResult.raw as Array<{ id: string; external_id: string }>;
      if (revokedRows.length > 0) {
        await manager
          .createQueryBuilder()
          .update(RefreshTokenOrmEntity)
          .set({ status: RefreshTokenStatus.Revoked })
          .where('session_id IN (:...revokedInternalIds) AND status = :active', {
            revokedInternalIds: revokedRows.map((row) => row.id),
            active: RefreshTokenStatus.Active,
          })
          .execute();
      }
      return revokedRows.map((row) => row.external_id);
    });
  }

  private async resolveUserInternalId(
    manager: EntityManager | DataSource,
    userExternalId: string,
  ): Promise<string> {
    const rows: Array<{ id: string }> = await manager.query(
      `SELECT id FROM users WHERE external_id = $1`,
      [userExternalId],
    );
    if (rows.length === 0) {
      throw new Error(`User ${userExternalId} not found`);
    }
    return rows[0].id;
  }

  private async resolveUserExternalId(
    manager: EntityManager | DataSource,
    userInternalId: string,
  ): Promise<string> {
    const rows: Array<{ external_id: string }> = await manager.query(
      `SELECT external_id FROM users WHERE id = $1`,
      [userInternalId],
    );
    return rows[0].external_id;
  }

  private async resolveReplacedByExternalIds(
    manager: EntityManager | DataSource,
    tokenRows: RefreshTokenOrmEntity[],
  ): Promise<Map<string, string>> {
    const internalIds = [
      ...new Set(
        tokenRows
          .map((row) => row.replacedByInternalId)
          .filter((id): id is string => id !== null),
      ),
    ];
    if (internalIds.length === 0) {
      return new Map();
    }
    const rows: Array<{ id: string; external_id: string }> = await manager.query(
      `SELECT id, external_id FROM refresh_tokens WHERE id = ANY($1::bigint[])`,
      [internalIds],
    );
    return new Map(rows.map((row) => [row.id, row.external_id]));
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof QueryFailedError &&
      (error.driverError as { code?: string }).code === UNIQUE_VIOLATION
    );
  }
}
