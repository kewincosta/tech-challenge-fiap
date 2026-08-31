import { EntityId } from '../../../../shared/domain/entity-id';

export class PermissionId extends EntityId {
  private constructor(value: string) {
    super(value);
  }

  static create(value: string): PermissionId {
    return new PermissionId(EntityId.validate(value));
  }
}
