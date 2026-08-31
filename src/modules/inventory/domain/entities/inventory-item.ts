import { AggregateRoot } from '../../../../shared/domain/aggregate-root';
import { Money } from '../../../../shared/domain/value-objects/money';
import { AdjustmentNoteRequiredError } from '../errors/adjustment-note-required.error';
import { InventoryItemCreated } from '../events/inventory-item-created.event';
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
