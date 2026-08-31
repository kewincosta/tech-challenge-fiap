import { EntityId } from '../../../../shared/domain/entity-id';

export class ServiceId extends EntityId {
  private constructor(value: string) {
    super(value);
  }

  static create(value: string): ServiceId {
    return new ServiceId(EntityId.validate(value));
  }
}
