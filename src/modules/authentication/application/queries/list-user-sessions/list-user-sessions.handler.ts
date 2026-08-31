import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  SESSION_QUERY_PORT,
  SessionQueryPort,
  SessionSummaryDto,
} from '../../ports/session-query.port';
import { ListUserSessionsQuery } from './list-user-sessions.query';

@QueryHandler(ListUserSessionsQuery)
export class ListUserSessionsHandler
  implements IQueryHandler<ListUserSessionsQuery, SessionSummaryDto[]>
{
  constructor(@Inject(SESSION_QUERY_PORT) private readonly sessionQuery: SessionQueryPort) {}

  async execute(query: ListUserSessionsQuery): Promise<SessionSummaryDto[]> {
    return this.sessionQuery.listActiveByUserId(query.userId);
  }
}
