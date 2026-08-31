export class RevokeSessionCommand {
  constructor(
    readonly sessionId: string,
    readonly actorUserId: string,
  ) {}
}
