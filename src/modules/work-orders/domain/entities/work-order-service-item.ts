import { Money } from '../../../../shared/domain/value-objects/money';
import { WorkOrderItemId } from '../value-objects/work-order-item-id';

export interface WorkOrderServiceItemProps {
  id: WorkOrderItemId;
  serviceId: string;
  serviceName: string;
  unitPrice: Money;
  budgetRound: number | null;
  budgetedUnitPrice: Money | null;
}

export interface AddServiceItemInput {
  id: WorkOrderItemId;
  serviceId: string;
  serviceName: string;
  unitPrice: Money;
}

/**
 * One requested service, snapshotted at the moment it was added. Carries no quantity - phase 8's
 * own test list adds a service with none, unlike a part item.
 */
export class WorkOrderServiceItem {
  private constructor(private readonly props: WorkOrderServiceItemProps) {}

  static add(input: AddServiceItemInput): WorkOrderServiceItem {
    return new WorkOrderServiceItem({
      id: input.id,
      serviceId: input.serviceId,
      serviceName: input.serviceName,
      unitPrice: input.unitPrice,
      budgetRound: null,
      budgetedUnitPrice: null,
    });
  }

  static restore(props: WorkOrderServiceItemProps): WorkOrderServiceItem {
    return new WorkOrderServiceItem({ ...props });
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

  get serviceId(): string {
    return this.props.serviceId;
  }

  get serviceName(): string {
    return this.props.serviceName;
  }

  get unitPrice(): Money {
    return this.props.unitPrice;
  }

  get budgetRound(): number | null {
    return this.props.budgetRound;
  }

  get budgetedUnitPrice(): Money | null {
    return this.props.budgetedUnitPrice;
  }
}
