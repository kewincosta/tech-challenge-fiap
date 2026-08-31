import { EntityId } from '../../../../shared/domain/entity-id';

export class StockMovementId extends EntityId {
  private constructor(value: string) {
    super(value);
  }

  static create(value: string): StockMovementId {
    return new StockMovementId(EntityId.validate(value));
  }
}
