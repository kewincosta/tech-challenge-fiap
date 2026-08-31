export class ReplenishStockCommand {
  constructor(
    readonly itemId: string,
    readonly quantity: number,
    readonly unitPriceCents: number,
    readonly actorUserId: string,
    /** Optional on a replenishment - only an adjustment requires one. */
    readonly note?: string | null,
  ) {}
}
