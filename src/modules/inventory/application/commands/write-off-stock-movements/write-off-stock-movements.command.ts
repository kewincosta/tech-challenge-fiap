export class WriteOffStockMovementsCommand {
  constructor(
    readonly workOrderId: string,
    readonly actorUserId: string,
  ) {}
}
