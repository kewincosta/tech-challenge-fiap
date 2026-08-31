import { EntityId } from '../../../../shared/domain/entity-id';

export class InventoryItemId extends EntityId {
  private constructor(value: string) {
    super(value);
  }

  static create(value: string): InventoryItemId {
    return new InventoryItemId(EntityId.validate(value));
  }
}
