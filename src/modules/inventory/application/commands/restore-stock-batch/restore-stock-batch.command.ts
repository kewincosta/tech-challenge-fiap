export interface RestoreStockBatchLine {
  inventoryItemId: string;
  quantity: number;
  /** The consumption this return undoes, its own external id (rule 22, H32). */
  undoesMovementId: string;
}

export class RestoreStockBatchCommand {
  constructor(
    readonly lines: RestoreStockBatchLine[],
    readonly workOrderId: string,
    readonly actorUserId: string,
  ) {}
}
