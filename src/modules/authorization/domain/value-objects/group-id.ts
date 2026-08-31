import { EntityId } from '../../../../shared/domain/entity-id';

export class GroupId extends EntityId {
  private constructor(value: string) {
    super(value);
  }

  static create(value: string): GroupId {
    return new GroupId(EntityId.validate(value));
  }
}
