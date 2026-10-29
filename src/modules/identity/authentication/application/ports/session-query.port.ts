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
