export class CompleteWorkOrderCommand {
  constructor(
    readonly workOrderNumber: string,
    readonly actorUserId: string,
  ) {}
}
