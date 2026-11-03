export class ConfirmConsumptionCommand {
  constructor(
    /** The operation whose consumptions get a confirmation time. */
    readonly operationId: string,
    /** Who the work order acted for. The confirmation records a time and keeps no actor. */
    readonly actorUserId: string,
  ) {}
}
