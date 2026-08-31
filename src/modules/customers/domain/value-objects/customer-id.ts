import { EntityId } from '../../../../shared/domain/entity-id';

export class CustomerId extends EntityId {
  private constructor(value: string) {
    super(value);
  }

  static create(value: string): CustomerId {
    return new CustomerId(EntityId.validate(value));
  }
}
