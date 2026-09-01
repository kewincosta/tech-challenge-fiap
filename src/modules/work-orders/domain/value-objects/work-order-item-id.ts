import { EntityId } from '../../../../shared/domain/entity-id';

export class WorkOrderItemId extends EntityId {
  private constructor(value: string) {
    super(value);
  }

  static create(value: string): WorkOrderItemId {
    return new WorkOrderItemId(EntityId.validate(value));
  }
}
