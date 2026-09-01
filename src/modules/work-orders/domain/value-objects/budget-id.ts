import { EntityId } from '../../../../shared/domain/entity-id';

export class BudgetId extends EntityId {
  private constructor(value: string) {
    super(value);
  }

  static create(value: string): BudgetId {
    return new BudgetId(EntityId.validate(value));
  }
}
