import { DomainEvent } from '../../../../shared/domain/domain-event';

export class VehicleRegistered extends DomainEvent {
  constructor(
    readonly vehicleId: string,
    readonly customerId: string,
    occurredAt: Date,
  ) {
    super(occurredAt);
  }
}
