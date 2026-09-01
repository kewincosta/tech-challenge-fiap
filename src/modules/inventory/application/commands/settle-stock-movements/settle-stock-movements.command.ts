export class SettleStockMovementsCommand {
  constructor(
    readonly workOrderId: string,
    readonly actorUserId: string,
  ) {}
}
