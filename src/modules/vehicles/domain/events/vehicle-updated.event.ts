import { DomainEvent } from '../../../../shared/domain/domain-event';

export class VehicleUpdated extends DomainEvent {
  constructor(
    readonly vehicleId: string,
    occurredAt: Date,
  ) {
    super(occurredAt);
  }
}
