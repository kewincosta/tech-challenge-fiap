import { EntityId } from '../../../../shared/domain/entity-id';

export class WorkOrderId extends EntityId {
  private constructor(value: string) {
    super(value);
  }

  static create(value: string): WorkOrderId {
    return new WorkOrderId(EntityId.validate(value));
  }
}
