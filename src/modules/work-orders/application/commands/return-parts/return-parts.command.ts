export interface ReturnPartsLine {
  /** The work order item's own external id - not the inventory item's (spec.md's Assumptions). */
  itemId: string;
  quantity: number;
}

export class ReturnPartsCommand {
  constructor(
    readonly workOrderNumber: string,
    readonly lines: ReturnPartsLine[],
    readonly actorUserId: string,
  ) {}
}
