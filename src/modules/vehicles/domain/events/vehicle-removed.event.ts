import { DomainEvent } from '../../../../shared/domain/domain-event';

export class VehicleRemoved extends DomainEvent {
  constructor(
    readonly vehicleId: string,
    occurredAt: Date,
  ) {
    super(occurredAt);
  }
}
