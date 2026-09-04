import { AggregateRoot } from '../../../../shared/domain/aggregate-root';
import { Money } from '../../../../shared/domain/value-objects/money';
import { AdjustmentNoteRequiredError } from '../errors/adjustment-note-required.error';
import { InventoryItemCreated } from '../events/inventory-item-created.event';
import { InventoryItemDeactivated } from '../events/inventory-item-deactivated.event';
import { InventoryItemUpdated } from '../events/inventory-item-updated.event';
import { StockAdjusted } from '../events/stock-adjusted.event';
import { StockReplenished } from '../events/stock-replenished.event';
import { InventoryItemKind } from '../inventory-item-kind';
import { InventoryItemStatus } from '../inventory-item-status';
import { StockMovementKind } from '../stock-movement-kind';
import { InventoryItemId } from '../value-objects/inventory-item-id';
import { Sku } from '../value-objects/sku';
import { StockMovementId } from '../value-objects/stock-movement-id';
import { StockQuantity } from '../value-objects/stock-quantity';
import { StockMovement } from './stock-movement';

interface InventoryItemProps {
  id: InventoryItemId;
  sku: Sku;
  name: string;
  description: string | null;
  kind: InventoryItemKind;
  unitPrice: Money;
  quantityOnHand: StockQuantity;
  status: InventoryItemStatus;
  createdAt: Date;
  updatedAt: Date;
  movements: StockMovement[];
}

/** What `findById` restores. Deliberately carries no movements - the history is a read model. */
type RestoreInventoryItemProps = Omit<InventoryItemProps, 'movements'>;

interface CreateInventoryItemInput {
  id: InventoryItemId;
  sku: Sku;
  name: string;
  description?: string | null;
  kind: InventoryItemKind;
  unitPrice: Money;
  now: Date;
}

interface UpdateInventoryItemInput {
  name?: string;
  /** `null` clears the description; omitting the field leaves it untouched. */
  description?: string | null;
  unitPrice?: Money;
}

interface ReplenishStockInput {
  quantity: number;
  unitPrice: Money;
  actorUserId: string;
  note?: string | null;
  movementId: StockMovementId;
  now: Date;
}

interface AdjustStockDownInput {
  quantity: number;
  actorUserId: string;
  note: string;
  movementId: StockMovementId;
  now: Date;
}

interface ConsumeStockInput {
  quantity: number;
  workOrderId: string;
  actorUserId: string;
  movementId: StockMovementId;
  now: Date;
}

interface RestoreStockInput {
  quantity: number;
  workOrderId: string;
  actorUserId: string;
  movementId: StockMovementId;
  undoesMovementId: string;
  now: Date;
}

/**
 * One part or supply, its truthful count, and the movements appended during this request.
 * `findById` never attaches movements (design.md) - the full ledger is read back through
 * `TypeOrmInventoryQueryAdapter`, not through this aggregate.
 */
export class InventoryItem extends AggregateRoot {
  private constructor(private readonly props: InventoryItemProps) {
    super();
  }

  static create(input: CreateInventoryItemInput): InventoryItem {
    const item = new InventoryItem({
      id: input.id,
      sku: input.sku,
      name: input.name,
      description: input.description ?? null,
      kind: input.kind,
      unitPrice: input.unitPrice,
      quantityOnHand: StockQuantity.of(0),
      status: InventoryItemStatus.Active,
      createdAt: input.now,
      updatedAt: input.now,
      movements: [],
    });
    item.record(new InventoryItemCreated(input.id.value, input.now));
    return item;
  }

  static restore(props: RestoreInventoryItemProps): InventoryItem {
    return new InventoryItem({ ...props, movements: [] });
  }

  /** Cannot touch `quantityOnHand` - only a movement moves the count (INV-01 AC6). */
  updateDetails(input: UpdateInventoryItemInput, now: Date): void {
    if (input.name !== undefined) {
      this.props.name = input.name;
    }
    if (input.description !== undefined) {
      this.props.description = input.description;
    }
    if (input.unitPrice !== undefined) {
      this.props.unitPrice = input.unitPrice;
    }
    this.props.updatedAt = now;
    this.record(new InventoryItemUpdated(this.props.id.value, now));
  }

  /**
   * Takes the item out of the catalog and keeps the record, the same soft delete `Service`
   * performs. Idempotent, so a second call records no event. The count is left untouched: the
   * units are still on the shelf, and only a movement moves the count (INV-01 AC6).
   */
  deactivate(now: Date): void {
    if (this.props.status === InventoryItemStatus.Inactive) {
      return;
    }
    this.props.status = InventoryItemStatus.Inactive;
    this.props.updatedAt = now;
    this.record(new InventoryItemDeactivated(this.props.id.value, now));
  }

  replenish(input: ReplenishStockInput): void {
    const movement = StockMovement.record({
      id: input.movementId,
      kind: StockMovementKind.Inbound,
      quantity: input.quantity,
      unitPrice: input.unitPrice,
      actorUserId: input.actorUserId,
      note: input.note,
      now: input.now,
    });
    this.props.quantityOnHand = this.props.quantityOnHand.plus(input.quantity);
    this.props.movements.push(movement);
    this.props.updatedAt = input.now;
    this.record(
      new StockReplenished(this.props.id.value, movement.id.value, input.quantity, input.now),
    );
  }

  /**
   * Lowers the count via `StockQuantity.minus`, which is where the never-negative invariant
   * actually lives. Both the movement and the new quantity are computed before anything on
   * `props` changes, so a thrown `AdjustmentNoteRequiredError` or `InsufficientStockError`
   * leaves the count and `newMovements` exactly as they were.
   */
  adjustDown(input: AdjustStockDownInput): void {
    const note = input.note?.trim();
    if (!note) {
      throw new AdjustmentNoteRequiredError();
    }
    const movement = StockMovement.record({
      id: input.movementId,
      kind: StockMovementKind.Adjustment,
      quantity: input.quantity,
      unitPrice: this.props.unitPrice,
      actorUserId: input.actorUserId,
      note,
      now: input.now,
    });
    const quantityOnHand = this.props.quantityOnHand.minus(input.quantity);
    this.props.quantityOnHand = quantityOnHand;
    this.props.movements.push(movement);
    this.props.updatedAt = input.now;
    this.record(
      new StockAdjusted(this.props.id.value, movement.id.value, input.quantity, input.now),
    );
  }

  /**
   * Lowers the count for a work order withdrawal. The unit price recorded is this item's own
   * catalog price at this moment - for the movement record only, never what the work order
   * charges (rule 32, spec.md's Assumptions). Same compute-before-mutate ordering as `adjustDown`:
   * a thrown `InsufficientStockError` leaves the count and `newMovements` exactly as they were.
   */
  consume(input: ConsumeStockInput): void {
    const movement = StockMovement.consume({
      id: input.movementId,
      quantity: input.quantity,
      unitPrice: this.props.unitPrice,
      actorUserId: input.actorUserId,
      workOrderId: input.workOrderId,
      now: input.now,
    });
    const quantityOnHand = this.props.quantityOnHand.minus(input.quantity);
    this.props.quantityOnHand = quantityOnHand;
    this.props.movements.push(movement);
    this.props.updatedAt = input.now;
  }

  /**
   * Raises the count for a part returned unused. `undoesMovementId` arrives already resolved -
   * `RestoreStockBatchHandler` looks it up from the ledger via `findPendingConsumptions` before
   * calling this (the T12 correction in tasks.md: work-orders has no durable place to remember a
   * movement id across requests, so this aggregate still never loads prior movements itself).
   */
  restoreUnits(input: RestoreStockInput): void {
    const movement = StockMovement.undo({
      id: input.movementId,
      quantity: input.quantity,
      unitPrice: this.props.unitPrice,
      actorUserId: input.actorUserId,
      workOrderId: input.workOrderId,
      undoesMovementId: input.undoesMovementId,
      now: input.now,
    });
    this.props.quantityOnHand = this.props.quantityOnHand.plus(input.quantity);
    this.props.movements.push(movement);
    this.props.updatedAt = input.now;
  }

  /**
   * Non-draining: reading this twice returns the same movements. A drain would lose the ledger
   * row on a retried failed save (design.md's Tech Decisions).
   */
  get newMovements(): readonly StockMovement[] {
    return [...this.props.movements];
  }

  get id(): InventoryItemId {
    return this.props.id;
  }

  get sku(): Sku {
    return this.props.sku;
  }

  get name(): string {
    return this.props.name;
  }

  get description(): string | null {
    return this.props.description;
  }

  get kind(): InventoryItemKind {
    return this.props.kind;
  }

  get unitPrice(): Money {
    return this.props.unitPrice;
  }

  get quantityOnHand(): StockQuantity {
    return this.props.quantityOnHand;
  }

  get status(): InventoryItemStatus {
    return this.props.status;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
