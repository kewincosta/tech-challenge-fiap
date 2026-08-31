import { EntityId } from '../../../../shared/domain/entity-id';

export class UserId extends EntityId {
  private constructor(value: string) {
    super(value);
  }

  static create(value: string): UserId {
    return new UserId(EntityId.validate(value));
  }
}
