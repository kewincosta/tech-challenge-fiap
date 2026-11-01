export interface StockLine {
  inventoryItemId: string;
  quantity: number;
}

/**
 * Moves stock for a work order. Every call commits in a transaction that inventory opens itself, so
 * a caller never holds a transaction that writes stock, and no call needs one open. A call that
 * fails changes nothing. Each call is safe to repeat: a consumption or a restore is tagged with the
 * operation id the caller chose, and an undo, a confirmation, a settlement and a write-off act on
 * what is still there to act on.
 */
export interface StockLedger {
  /**
   * Takes the lines off the shelf and tags the movements with `operationId`, which `undoConsumption`
   * finds them by. Commits in a transaction of inventory's own, all lines together. Refuses with the
   * inventory module's error when stock falls short, and then changes nothing.
   */
  consume(
    workOrderId: string,
    lines: StockLine[],
    actorUserId: string,
    operationId: string,
  ): Promise<void>;
  /**
   * Puts returned units back, undoing the work order's pending consumptions that it confirmed, all
   * lines together. The consumptions of a withdrawal still in flight are left to its undo. A second
   * call with the same `operationId` changes nothing.
   */
  restore(
    workOrderId: string,
    lines: StockLine[],
    actorUserId: string,
    operationId: string,
  ): Promise<void>;
  /**
   * Gives back what the consumptions tagged with `operationId` still hold, whatever status they
   * reached, as returns linked to the work order, in a transaction of inventory's own. Changes
   * nothing when the operation consumed nothing or was already undone.
   */
  undoConsumption(operationId: string, actorUserId: string): Promise<void>;
  /**
   * Records that the work order accepted the consumptions tagged with `operationId`, in a statement
   * of inventory's own. Changes nothing when the operation consumed nothing or was already
   * confirmed.
   */
  confirmConsumption(operationId: string, actorUserId: string): Promise<void>;
  /**
   * Closes the work order's confirmed pending consumptions as used. Settles nothing when there are
   * none.
   */
  settle(workOrderId: string, actorUserId: string): Promise<void>;
  /**
   * Writes the work order's confirmed outstanding consumptions off as a loss, and records one
   * transition for each. Writes off nothing when there are none, and two calls at once record each
   * transition once.
   */
  writeOff(workOrderId: string, actorUserId: string): Promise<void>;
}
