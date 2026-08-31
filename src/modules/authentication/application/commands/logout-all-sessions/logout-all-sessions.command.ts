export class LogoutAllSessionsCommand {
  constructor(readonly userId: string) {}
}

export interface LogoutAllSessionsResultDto {
  revokedSessions: number;
}
