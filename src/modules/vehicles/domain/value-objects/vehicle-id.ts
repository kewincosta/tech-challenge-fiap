import { EntityId } from '../../../../shared/domain/entity-id';

export class VehicleId extends EntityId {
  private constructor(value: string) {
    super(value);
  }

  static create(value: string): VehicleId {
    return new VehicleId(EntityId.validate(value));
  }
}
