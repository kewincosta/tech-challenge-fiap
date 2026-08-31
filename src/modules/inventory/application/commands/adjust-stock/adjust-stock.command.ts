export class AdjustStockCommand {
  constructor(
    readonly itemId: string,
    readonly quantity: number,
    readonly actorUserId: string,
    /** Mandatory on an adjustment - a replenishment's note is optional. */
    readonly note: string,
  ) {}
}
