import { Money } from '../../../../shared/domain/value-objects/money';
import { InvalidMovementQuantityError } from '../errors/invalid-movement-quantity.error';
import { StockMovementKind } from '../stock-movement-kind';
import { StockMovementStatus } from '../stock-movement-status';
import { StockMovementId } from '../value-objects/stock-movement-id';

export interface StockMovementProps {
  id: StockMovementId;
  kind: StockMovementKind;
  quantity: number;
  unitPrice: Money;
  actorUserId: string;
  note: string | null;
  occurredAt: Date;
  status: StockMovementStatus | null;
  workOrderId: string | null;
  undoesMovementId: string | null;
}

export interface RecordMovementInput {
  id: StockMovementId;
  kind: StockMovementKind;
  quantity: number;
  unitPrice: Money;
  actorUserId: string;
  note?: string | null;
  now: Date;
}

/**
 * One line of the ledger. Recorded once, never edited: the class exposes read-only getters and
 * no setter or mutating method at all, so nothing in this codebase can change a movement after
 * it is written (spec.md INV-04's "never update or delete a movement once it is written").
 */
export class StockMovement {
  private constructor(private readonly props: StockMovementProps) {}

  /**
   * Builds an `INBOUND` or `ADJUSTMENT` movement. `status` and `workOrderId` are always null here
   * - only a consumption carries either, and consumptions are not recorded until phases 11-12
   * (section 9's invariant).
   */
  static record(input: RecordMovementInput): StockMovement {
    if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
      throw new InvalidMovementQuantityError();
    }
    return new StockMovement({
      id: input.id,
      kind: input.kind,
      quantity: input.quantity,
      unitPrice: input.unitPrice,
      actorUserId: input.actorUserId,
      note: input.note ?? null,
      occurredAt: input.now,
      status: null,
      workOrderId: null,
      undoesMovementId: null,
    });
  }

  static restore(props: StockMovementProps): StockMovement {
    return new StockMovement({ ...props });
  }

  get id(): StockMovementId {
    return this.props.id;
  }

  get kind(): StockMovementKind {
    return this.props.kind;
  }

  get quantity(): number {
    return this.props.quantity;
  }

  get unitPrice(): Money {
    return this.props.unitPrice;
  }

  get actorUserId(): string {
    return this.props.actorUserId;
  }

  get note(): string | null {
    return this.props.note;
  }

  get occurredAt(): Date {
    return this.props.occurredAt;
  }

  get status(): StockMovementStatus | null {
    return this.props.status;
  }

  get workOrderId(): string | null {
    return this.props.workOrderId;
  }

  get undoesMovementId(): string | null {
    return this.props.undoesMovementId;
  }
}
