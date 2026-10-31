export interface ConsumeStockBatchLine {
  inventoryItemId: string;
  quantity: number;
}

export class ConsumeStockBatchCommand {
  constructor(
    readonly lines: ConsumeStockBatchLine[],
    readonly workOrderId: string,
    readonly actorUserId: string,
    /** Tags every movement the command writes, so an undo can find them. */
    readonly operationId: string,
  ) {}
}

export interface ConsumedLineDto {
  inventoryItemId: string;
  /** The minted CONSUMPTION movement's own external id - what a later return points at. */
  movementId: string;
}
