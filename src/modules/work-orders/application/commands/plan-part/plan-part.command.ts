export class PlanPartCommand {
  constructor(
    readonly workOrderNumber: string,
    readonly inventoryItemId: string,
    readonly quantity: number,
    readonly actorUserId: string,
  ) {}
}
