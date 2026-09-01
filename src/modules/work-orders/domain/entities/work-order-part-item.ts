import { Money } from '../../../../shared/domain/value-objects/money';
import { PlannedQuantity } from '../value-objects/planned-quantity';
import { WorkOrderItemId } from '../value-objects/work-order-item-id';

export interface WorkOrderPartItemProps {
  id: WorkOrderItemId;
  inventoryItemId: string;
  sku: string;
  itemName: string;
  unitPrice: Money;
  plannedQuantity: PlannedQuantity;
  withdrawnQuantity: number;
  budgetRound: number | null;
  budgetedUnitPrice: Money | null;
}

export interface AddPartItemInput {
  id: WorkOrderItemId;
  inventoryItemId: string;
  sku: string;
  itemName: string;
  unitPrice: Money;
  plannedQuantity: PlannedQuantity;
}

/**
 * One planned part, snapshotted at the moment it was planned. The withdrawn quantity is created
 * here because phase 8 names the column, and stays at zero: withdrawal is phase 11 (spec.md's
 * Out of Scope).
 */
export class WorkOrderPartItem {
  private constructor(private readonly props: WorkOrderPartItemProps) {}

  static add(input: AddPartItemInput): WorkOrderPartItem {
    return new WorkOrderPartItem({
      id: input.id,
      inventoryItemId: input.inventoryItemId,
      sku: input.sku,
      itemName: input.itemName,
      unitPrice: input.unitPrice,
      plannedQuantity: input.plannedQuantity,
      withdrawnQuantity: 0,
      budgetRound: null,
      budgetedUnitPrice: null,
    });
  }

  static restore(props: WorkOrderPartItemProps): WorkOrderPartItem {
    return new WorkOrderPartItem({ ...props });
  }

  /**
   * Called only by `WorkOrder`'s private `generateRound` while completing a diagnosis or
   * submitting a supplementary budget. Copies `unitPrice` as the price this item is now
   * charged at - the only price ever charged for it (design.md).
   */
  attachToBudget(round: number): void {
    this.props.budgetRound = round;
    this.props.budgetedUnitPrice = this.props.unitPrice;
  }

  get isDraft(): boolean {
    return this.props.budgetRound === null;
  }

  get id(): WorkOrderItemId {
    return this.props.id;
  }

  get inventoryItemId(): string {
    return this.props.inventoryItemId;
  }

  get sku(): string {
    return this.props.sku;
  }

  get itemName(): string {
    return this.props.itemName;
  }

  get unitPrice(): Money {
    return this.props.unitPrice;
  }

  get plannedQuantity(): PlannedQuantity {
    return this.props.plannedQuantity;
  }

  get withdrawnQuantity(): number {
    return this.props.withdrawnQuantity;
  }

  get budgetRound(): number | null {
    return this.props.budgetRound;
  }

  get budgetedUnitPrice(): Money | null {
    return this.props.budgetedUnitPrice;
  }
}
