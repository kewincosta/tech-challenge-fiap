export class UndoConsumptionCommand {
  constructor(
    /** The operation whose consumptions are returned, and the tag the returns carry. */
    readonly operationId: string,
    readonly actorUserId: string,
  ) {}
}
