export class CancelWorkOrderCommand {
  constructor(
    readonly workOrderNumber: string,
    readonly reason: string,
    readonly actorUserId: string,
  ) {}
}
