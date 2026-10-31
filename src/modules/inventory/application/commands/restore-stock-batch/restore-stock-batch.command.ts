export interface RestoreStockBatchLine {
  inventoryItemId: string;
  quantity: number;
}

export class RestoreStockBatchCommand {
  constructor(
    readonly lines: RestoreStockBatchLine[],
    readonly workOrderId: string,
    readonly actorUserId: string,
    /** Tags every return the command writes. A second command with the same id changes nothing. */
    readonly operationId: string,
  ) {}
}
