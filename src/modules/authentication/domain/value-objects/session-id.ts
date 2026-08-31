import { EntityId } from '../../../../shared/domain/entity-id';

export class SessionId extends EntityId {
  private constructor(value: string) {
    super(value);
  }

  static create(value: string): SessionId {
    return new SessionId(EntityId.validate(value));
  }
}
