export interface StockLine {
  inventoryItemId: string;
  quantity: number;
}

/**
 * Moves stock for a work order. Every call runs inside the caller's transaction, so a failure
 * after the work order was saved leaves neither write behind (AD-008).
 */
export interface StockLedger {
  /** Takes the lines off the shelf. Refuses with the inventory module's error when stock falls short. */
  consume(workOrderId: string, lines: StockLine[], actorUserId: string): Promise<void>;
  /** Puts returned units back, undoing the work order's pending consumptions. */
  restore(workOrderId: string, lines: StockLine[], actorUserId: string): Promise<void>;
  /** Closes the work order's pending consumptions as used. Settles nothing when there are none. */
  settle(workOrderId: string, actorUserId: string): Promise<void>;
  /** Writes the work order's outstanding consumptions off as a loss. Writes off nothing when there are none. */
  writeOff(workOrderId: string, actorUserId: string): Promise<void>;
}
