export interface WithdrawPartsLine {
  /** The work order item's own external id - not the inventory item's (spec.md's Assumptions). */
  itemId: string;
  quantity: number;
}

export class WithdrawPartsCommand {
  constructor(
    readonly workOrderNumber: string,
    readonly lines: WithdrawPartsLine[],
    readonly actorUserId: string,
  ) {}
}
