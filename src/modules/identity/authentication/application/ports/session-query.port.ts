export interface SessionSummaryDto {
  id: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string;
}

export interface SessionQueryPort {
  listActiveByUserId(userId: string): Promise<SessionSummaryDto[]>;
}

export const SESSION_QUERY_PORT = Symbol('SessionQueryPort');
