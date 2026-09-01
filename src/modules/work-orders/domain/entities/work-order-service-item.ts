import { Money } from '../../../../shared/domain/value-objects/money';
import { WorkOrderItemId } from '../value-objects/work-order-item-id';

export interface WorkOrderServiceItemProps {
  id: WorkOrderItemId;
  serviceId: string;
  serviceName: string;
  unitPrice: Money;
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
    });
  }

  static restore(props: WorkOrderServiceItemProps): WorkOrderServiceItem {
    return new WorkOrderServiceItem({ ...props });
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
}
