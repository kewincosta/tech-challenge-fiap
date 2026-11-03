import { SessionQueryPort, SessionSummaryDto } from '../../ports/session-query.port';
import { ListUserSessionsQuery } from './list-user-sessions.query';

export class ListUserSessionsUseCase {
  constructor(private readonly sessionQuery: SessionQueryPort) {}

  async execute(query: ListUserSessionsQuery): Promise<SessionSummaryDto[]> {
    return this.sessionQuery.listActiveByUserId(query.userId);
  }
}
