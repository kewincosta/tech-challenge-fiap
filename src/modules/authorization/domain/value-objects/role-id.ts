import { EntityId } from '../../../../shared/domain/entity-id';

export class RoleId extends EntityId {
  private constructor(value: string) {
    super(value);
  }

  static create(value: string): RoleId {
    return new RoleId(EntityId.validate(value));
  }
}
