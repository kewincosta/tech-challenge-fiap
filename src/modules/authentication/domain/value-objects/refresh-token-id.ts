import { EntityId } from '../../../../shared/domain/entity-id';

export class RefreshTokenId extends EntityId {
  private constructor(value: string) {
    super(value);
  }

  static create(value: string): RefreshTokenId {
    return new RefreshTokenId(EntityId.validate(value));
  }
}
