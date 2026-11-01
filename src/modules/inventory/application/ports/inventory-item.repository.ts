import { InventoryItem } from '../../domain/entities/inventory-item';
import { InventoryItemId } from '../../domain/value-objects/inventory-item-id';
import { Sku } from '../../domain/value-objects/sku';

export interface PendingConsumptionDto {
  /** The consumption's own external id - what a RETURN's `undoes_movement_id` points at. */
  movementId: string;
  quantity: number;
}

/** A pending consumption of one stock operation, with the item and the work order it belongs to. */
export interface OperationConsumptionDto extends PendingConsumptionDto {
  inventoryItemId: string;
  workOrderId: string;
}

export interface MovementClosureInput {
  workOrderId: string;
  actorUserId: string;
  now: Date;
}

export interface InventoryItemRepository {
  /** Never attaches movements - the full ledger is a read model, not part of this aggregate. */
  findById(id: InventoryItemId): Promise<InventoryItem | null>;
  /**
   * Active items only. No `excludingId` - unlike `ServiceRepository.existsActiveByName`, SKU is
   * create-only (`UpdateInventoryItemCommand` has no `sku` field), so there is no rename case that
   * would need to exclude its own row.
   */
  existsActiveBySku(sku: Sku): Promise<boolean>;
  save(item: InventoryItem): Promise<void>;
  /**
   * Locks every addressed item in one query, ordered by internal id - the deadlock guarantee for
   * a withdrawal batch, expressed here rather than left to the caller (design.md's Risks &
   * Concerns): two overlapping batches naming the same items in different orders both take their
   * locks in the same order, so one waits instead of Postgres killing either with `40P01`. An id
   * matching nothing is simply absent from the result, no throw. Must run inside an open
   * transaction - `save()`'s own `inTransaction` if there is an ambient one.
   */
  findAllByIdsForUpdate(ids: InventoryItemId[]): Promise<InventoryItem[]>;
  /**
   * The `CONSUMPTION` movements a return draws from, newest first (spec.md's Assumptions: "the
   * work order's pending consumptions for that item, drawn newest first"). Only confirmed
   * consumptions are offered: one that a withdrawal wrote and its work order has not confirmed yet
   * belongs to that withdrawal's undo, and a consumption with no operation id counts at once.
   * Work-orders has no way to know a movement id, because that data lives only in
   * `stock_movements`, inventory's own ledger, so `RestoreStockBatchUseCase` resolves it itself
   * rather than the caller supplying it.
   */
  findPendingConsumptions(
    inventoryItemId: InventoryItemId,
    workOrderId: string,
  ): Promise<PendingConsumptionDto[]>;
  /**
   * The consumptions that one stock operation wrote and that still hold units, whatever their
   * status and whether the work order confirmed them, newest first, each carrying what is left on
   * it after the returns that point at it: the figure `findPendingConsumptions` reports. A
   * consumption that a write-off or a settlement closed in the meantime is included, because an
   * undone operation never reached the work order, so its units go back. Empty when the operation
   * consumed nothing, or when an earlier undo returned everything. This is what an undo of the
   * operation gives back.
   */
  findPendingConsumptionsOfOperation(operationId: string): Promise<OperationConsumptionDto[]>;
  /** Whether a `RETURN` that one stock operation wrote is already on the ledger. */
  hasReturnOfOperation(operationId: string): Promise<boolean>;
  /**
   * Sets `confirmedAt` on the consumptions that one stock operation wrote and that have no
   * confirmation time, in one statement. A consumption already confirmed keeps its time, so a
   * repeat changes nothing, and neither does an operation that wrote no consumption. The returns an
   * undo tagged with the same operation id are not consumptions and are left alone.
   */
  confirmConsumptionsOfOperation(operationId: string, confirmedAt: Date): Promise<void>;
  /**
   * Every confirmed `PENDING` consumption of that work order moves to `SETTLED`, regardless of
   * whether a later return already drained it. A fully returned consumption is still settled like
   * any other, since delivery closes the book on every movement the work order caused (rule 23,
   * spec.md's edge case). A consumption its work order has not confirmed stays as it is. Never
   * touches `quantity_on_hand`: the units already left at withdrawal. Returns how many it moved.
   * Must run in one transaction, because it writes more than one statement.
   */
  settleWorkOrderConsumptions(input: MovementClosureInput): Promise<number>;
  /**
   * Every confirmed `PENDING` consumption of that work order with anything still outstanding moves
   * to `WRITTEN_OFF`, the transition row carrying the net lost quantity: `quantity` minus every
   * `RETURN` pointing at it, the same expression `findPendingConsumptions` uses (rule 24). A
   * consumption already drained to zero by prior returns is skipped: nothing was lost from it. A
   * consumption its work order has not confirmed stays as it is. Only the rows still pending are
   * updated and only those get a transition, so two runs that read the same consumptions record
   * each transition once. Never touches `quantity_on_hand`. Returns how many it wrote off. Must
   * run in one transaction, because it writes more than one statement.
   */
  writeOffWorkOrderConsumptions(input: MovementClosureInput): Promise<number>;
}
