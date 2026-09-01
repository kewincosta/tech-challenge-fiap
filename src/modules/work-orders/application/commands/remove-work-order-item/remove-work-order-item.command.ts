export class RemoveWorkOrderItemCommand {
  constructor(
    readonly workOrderNumber: string,
    readonly itemId: string,
    readonly actorUserId: string,
  ) {}
}
