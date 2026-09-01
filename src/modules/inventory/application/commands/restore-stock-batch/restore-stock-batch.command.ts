export interface RestoreStockBatchLine {
  inventoryItemId: string;
  quantity: number;
}

export class RestoreStockBatchCommand {
  constructor(
    readonly lines: RestoreStockBatchLine[],
    readonly workOrderId: string,
    readonly actorUserId: string,
  ) {}
}
